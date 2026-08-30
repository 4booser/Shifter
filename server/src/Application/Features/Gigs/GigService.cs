using Microsoft.EntityFrameworkCore;

using Serilog;
using Shifter.Application.Features.business.Services;
using Shifter.Application.Features.business.DTOs;

using Shifter.Application.Common.Exceptions;
using Shifter.Application.Features.Push;
using Shifter.Domain.Entities;
using Shifter.Infrastructure.Persistence.DbContexts;

namespace Shifter.Application.Features.Gigs;

/// <summary>
/// The freelance shift board. Anyone may post a gig for their venue and
/// anyone may answer one; what crosses between them is only what each side
/// typed in on purpose. Money here is a label on a card, never a wage the
/// calendar computes — a gig belongs to the venue's till, not to payroll.
/// </summary>
public sealed class GigService
{
    private readonly ShifterDbContext _db;
    private readonly IPushNotifier _push;
    private readonly UrgentAlerts? _alerts;

    public GigService(ShifterDbContext db, IPushNotifier push, UrgentAlerts? alerts = null)
    {
        _db = db;
        _push = push;
        _alerts = alerts;
    }

    public async Task<GigDto[]> BoardAsync(
        int userId, DateOnly from, DateOnly to, string? category, string? city, string? employment, CancellationToken ct)
    {
        if (to < from) (from, to) = (to, from);
        if (to.DayNumber - from.DayNumber > 400)
            throw new ValidationException("At most a year and a bit at a time.");

        var query = _db.GigListings
            .AsNoTracking()
            .Include(gig => gig.Responses)
            .Where(gig => gig.Status != GigStatus.Closed);

        var wanted = GigRules.ParseEmployment(employment);

        // A permanent seat is not pinned to one evening: its Date is merely
        // "from when", so the date window applies to freelance covers only.
        query = wanted == GigEmployment.Permanent
            ? query.Where(gig => gig.Employment == GigEmployment.Permanent)
            : query.Where(gig => gig.Employment == GigEmployment.Freelance && gig.Date >= from && gig.Date <= to);

        if (!string.IsNullOrWhiteSpace(category))
        {
            var parsed = GigRules.ParseCategory(category);

            query = query.Where(gig => gig.Category == parsed);
        }

        if (!string.IsNullOrWhiteSpace(city))
        {
            var needle = city.Trim().ToLower();

            query = query.Where(gig => gig.City.ToLower().Contains(needle));
        }

        var rows = await query
            .OrderBy(gig => gig.Date).ThenBy(gig => gig.StartTime).ThenBy(gig => gig.Id)
            .ToArrayAsync(ct);

        var employerRatings = await RatingsAsync(
            rows.Select(gig => gig.OwnerUserId).Distinct().ToArray(), byEmployer: false, ct);

        // The reader's own last three months, so every card can say what it is
        // worth to them rather than only what it pays. Read once for the whole
        // board; a listing is judged against a person, not the other way round.
        LocationTotalDto[] mine = await MyHoursAsync(userId, ct);

        // Their own history with each venue, which beats anybody else's stars.
        // Four evenings there already answers more than a 4.6 from strangers.
        var history = await HistoryWithAsync(
            userId, rows.Select(gig => gig.OwnerUserId).Distinct().ToArray(), ct);

        // A badge earned by shifts that happened and people who came back to
        // say so, rather than one claimed on a registration form.
        var trusted = await TrustedAsync(
            rows.Select(gig => gig.OwnerUserId).Distinct().ToArray(), ct);

        return rows
            .Select(gig => ToDto(gig, userId, employerRatings, mine, history, trusted))
            .ToArray();
    }

    public async Task<GigDto> SaveAsync(int userId, int? id, GigSaveDto request, CancellationToken ct)
    {
        var venue = GigRules.CleanRequired(request.venue, GigListing.VenueMax, "Venue");
        var title = GigRules.CleanRequired(request.title, GigListing.TitleMax, "Title");
        var city = GigRules.CleanRequired(request.city, GigListing.CityMax, "City");
        var details = GigRules.CleanOptional(request.details, GigListing.DetailsMax, "Details");
        var category = GigRules.ParseCategory(request.category);
        var period = GigRules.ParsePayPeriod(request.pay_period);
        var employment = GigRules.ParseEmployment(request.employment);
        var photosJson = GigRules.CleanPhotos(request.photos);
        var schedule = GigRules.CleanOptional(request.schedule, GigListing.ScheduleMax, "Schedule");

        if (employment == GigEmployment.Freelance && period == "month")
            throw new ValidationException("A one-off shift cannot pay by the month.");
        var (start, end) = GigRules.ParseSlot(request.start, request.end);

        if (!DateOnly.TryParseExact(request.date, "yyyy-MM-dd", out var date))
            throw new ValidationException("date must be yyyy-MM-dd.");

        var percent = GigRules.ValidatePay(request.pay_amount, request.pay_percent);

        if (request.slots is < 1 or > GigListing.MaxSlots)
            throw new ValidationException($"Slots must be between 1 and {GigListing.MaxSlots}.");

        GigListing gig;

        if (id is int existing)
        {
            gig = await _db.GigListings
                .FirstOrDefaultAsync(row => row.Id == existing && row.OwnerUserId == userId, ct)
                ?? throw new NotFoundException("Gig does not exist.");
        }
        else
        {
            gig = new GigListing
            {
                OwnerUserId = userId,
                Venue = venue,
                Title = title,
                City = city,
                PayPeriod = period,
            };
            _db.GigListings.Add(gig);
        }

        gig.Venue = venue;
        gig.Category = category;
        gig.Title = title;
        gig.Details = details;
        gig.Date = date;
        gig.StartTime = start;
        gig.EndTime = end;
        gig.PayAmount = request.pay_amount;
        gig.PayPeriod = period;
        gig.PayPercent = percent;
        gig.Employment = employment;
        gig.PhotosJson = photosJson;
        gig.Schedule = schedule;
        gig.City = city;
        gig.Slots = request.slots;

        // Only a shift that starts today can be an emergency. Marking next
        // Friday urgent would teach people to ignore the word, and the word is
        // the entire mechanism.
        gig.Urgent = request.urgent
            && gig.Employment == GigEmployment.Freelance
            && gig.Date == DateOnly.FromDateTime(DateTime.UtcNow);

        await _db.SaveChangesAsync(ct);

        // Told once, after the listing exists, and never again however many
        // times it is edited afterwards.
        if (gig.Urgent && gig.AlertedAt is null && _alerts is not null)
        {
            gig.AlertedAt = DateTime.UtcNow;
            await _db.SaveChangesAsync(ct);
            await _alerts.RaiseAsync(gig, ct);
        }

        return ToDto(gig, userId);
    }

    public async Task<GigDto> SetStatusAsync(int userId, int id, string? status, CancellationToken ct)
    {
        var gig = await _db.GigListings
            .Include(row => row.Responses)
            .FirstOrDefaultAsync(row => row.Id == id && row.OwnerUserId == userId, ct)
            ?? throw new NotFoundException("Gig does not exist.");

        gig.Status = status?.Trim().ToLowerInvariant() switch
        {
            "open" => GigStatus.Open,
            "filled" => GigStatus.Filled,
            "closed" => GigStatus.Closed,
            _ => throw new ValidationException("status must be open, filled or closed."),
        };

        await _db.SaveChangesAsync(ct);

        return ToDto(gig, userId);
    }

    /// <summary>
    /// One reply as its listing's owner may see it. Every screen that shows a
    /// reply goes through here, because the rule it enforces — a contact is
    /// visible only once the person opened it — is the kind that has to be
    /// impossible to forget rather than merely written down somewhere.
    /// </summary>
    private static GigResponseDto Seen(
        GigResponse reply,
        Dictionary<int, (double Avg, int Count)> workerRatings)
        => new GigResponseDto(
            reply.Id,
            reply.UserId,
            $"{reply.User?.FirstName} {reply.User?.LastName}".Trim(),
            reply.User?.AvatarKind,
            reply.User?.AvatarData,
            reply.Message,
            reply.SharedPhone,
            reply.SharedTelegram,
            reply.AcceptedAt is not null,
            workerRatings.GetValueOrDefault(reply.UserId).Count > 0 ? workerRatings[reply.UserId].Avg : null,
            workerRatings.GetValueOrDefault(reply.UserId).Count,
            reply.CreatedAt.ToString("O"),
            reply.Stage);

    public async Task<GigWithResponsesDto[]> MineAsync(int userId, CancellationToken ct)
    {
        var rows = await _db.GigListings
            .AsNoTracking()
            .Include(gig => gig.Responses)!
            .ThenInclude(reply => reply.User)
            .Where(gig => gig.OwnerUserId == userId)
            .OrderByDescending(gig => gig.Date)
            .Take(100)
            .ToArrayAsync(ct);

        var workerRatings = await RatingsAsync(
            rows.SelectMany(gig => gig.Responses ?? []).Select(reply => reply.UserId).Distinct().ToArray(),
            byEmployer: true, ct);

        // Reading somebody's phone number is an event, and the person it
        // belongs to is told about it. Recorded here rather than on a separate
        // "reveal" click, because this is the request that actually carries
        // the number out of the database.
        await NoteContactsSeenAsync(rows.SelectMany(gig => gig.Responses ?? []), ct);

        return rows.Select(gig => new GigWithResponsesDto(
            ToDto(gig, userId),
            (gig.Responses ?? [])
                .OrderBy(reply => reply.CreatedAt)
                .Select(reply => Seen(reply, workerRatings))
                .ToArray()))
            .ToArray();
    }

    /// <summary>
    /// Marks the replies whose contacts have just gone out to an owner.
    ///
    /// Counted as occasions rather than page loads: a venue with the tab open
    /// all evening looked once. Counting refreshes would turn an honest log
    /// into an accusation, and the person reading it cannot tell the two
    /// apart.
    ///
    /// A failure here is swallowed. The log is a courtesy and the reply is the
    /// product; losing one view record is much better than a board that will
    /// not load.
    /// </summary>
    private async Task NoteContactsSeenAsync(
        IEnumerable<GigResponse> replies, CancellationToken ct)
    {
        var now = DateTime.UtcNow;

        var ids = replies
            .Where(reply => reply.IsNewLook(now))
            .Select(reply => reply.Id)
            .ToArray();

        if (ids.Length == 0) return;

        try
        {
            await _db.GigResponses
                .Where(reply => ids.Contains(reply.Id))
                .ExecuteUpdateAsync(
                    row => row
                        .SetProperty(reply => reply.ContactSeenAt, reply => reply.ContactSeenAt ?? now)
                        .SetProperty(reply => reply.ContactSeenLastAt, now)
                        .SetProperty(reply => reply.ContactSeenCount, reply => reply.ContactSeenCount + 1),
                    ct);
        }
        catch (Exception exception)
        {
            Log.Warning(exception, "Could not record who opened {Count} contacts", ids.Length);
        }
    }

    public async Task<GigDto[]> MyRepliesAsync(int userId, CancellationToken ct)
    {
        var rows = await _db.GigResponses
            .AsNoTracking()
            .Include(reply => reply.Listing)!
            .ThenInclude(gig => gig!.Responses)
            .Where(reply => reply.UserId == userId)
            .OrderByDescending(reply => reply.CreatedAt)
            .Take(100)
            .ToArrayAsync(ct);

        return rows
            .Where(reply => reply.Listing is not null)
            .Select(reply => ToDto(reply.Listing!, userId) with
            {
                // Where their contacts went, attached to their own reply and
                // nowhere else. Nobody has to go looking for this.
                contact_seen_at = reply.ContactSeenAt?.ToString("O"),
                contact_seen_last = reply.ContactSeenLastAt?.ToString("O"),
                contact_seen_count = reply.ContactSeenCount,
            })
            .ToArray();
    }

    public async Task<GigDto> RespondAsync(int userId, int id, GigRespondDto request, CancellationToken ct)
    {
        var gig = await _db.GigListings
            .Include(row => row.Responses)
            .FirstOrDefaultAsync(row => row.Id == id, ct)
            ?? throw new NotFoundException("Gig does not exist.");

        if (gig.Status != GigStatus.Open)
            throw new ConflictException("This gig is no longer taking replies.");

        if (gig.OwnerUserId == userId)
            throw new ValidationException("It is your own gig.");

        if ((gig.Responses ?? []).Any(reply => reply.UserId == userId))
            throw new ConflictException("You already answered this one.");

        // A quiet answer carries no contacts at all — not empty ones. The
        // person is asking, not applying, and the venue gets their card and
        // their stars to judge by, which is what it judges on anyway.
        var (phone, telegram) = request.quiet
            ? (null, null)
            : GigRules.CleanContacts(request.phone, request.telegram);

        var message = GigRules.CleanOptional(request.message, GigResponse.MessageMax, "Message");

        _db.GigResponses.Add(new GigResponse
        {
            ListingId = gig.Id,
            UserId = userId,
            Message = message,
            Phone = phone,
            Telegram = telegram,
            OpenedAt = request.quiet ? null : DateTime.UtcNow,
        });

        // Remember what the person agreed to share, so the next reply offers
        // it back instead of asking them to type it again.
        var me = await _db.Users.FirstOrDefaultAsync(user => user.Id == userId, ct);

        if (me is not null)
        {
            me.ContactPhone = phone ?? me.ContactPhone;
            me.ContactTelegram = telegram ?? me.ContactTelegram;
        }

        await _db.SaveChangesAsync(ct);

        await _push.NotifyAsync(
            gig.OwnerUserId,
            language => (language, request.quiet) switch
            {
                ("ru", true) => ("Спрашивают про смену", $"«{gig.Title}» {gig.Date:dd.MM} — человек присматривается."),
                ("uk", true) => ("Питають про зміну", $"«{gig.Title}» {gig.Date:dd.MM} — людина придивляється."),
                (_, true) => ("Somebody is asking", $"“{gig.Title}” {gig.Date:dd.MM} — a maybe, not a yes."),
                ("ru", _) => ("Отклик на подработку", $"«{gig.Title}» {gig.Date:dd.MM} — новый человек готов выйти."),
                ("uk", _) => ("Відгук на підробіток", $"«{gig.Title}» {gig.Date:dd.MM} — нова людина готова вийти."),
                _ => ("A reply to your gig", $"“{gig.Title}” {gig.Date:dd.MM} — somebody is in."),
            },
            "/my-listings",
            ct);

        return ToDto(gig, userId);
    }

    public async Task WithdrawAsync(int userId, int id, CancellationToken ct)
    {
        var reply = await _db.GigResponses
            .FirstOrDefaultAsync(row => row.ListingId == id && row.UserId == userId, ct)
            ?? throw new NotFoundException("You have not answered this gig.");

        _db.GigResponses.Remove(reply);
        await _db.SaveChangesAsync(ct);
    }

    public async Task<GigResponseDto> AcceptAsync(
        int userId, int gigId, int replyId, GigAcceptDto? request, CancellationToken ct)
    {
        var gig = await _db.GigListings
            .Include(row => row.Responses)!
            .ThenInclude(reply => reply.User)
            .FirstOrDefaultAsync(row => row.Id == gigId && row.OwnerUserId == userId, ct)
            ?? throw new NotFoundException("Gig does not exist.");

        var reply = (gig.Responses ?? []).FirstOrDefault(row => row.Id == replyId)
            ?? throw new NotFoundException("Reply does not exist.");

        if (reply.AcceptedAt is null)
        {
            reply.AcceptedAt = DateTime.UtcNow;

            // The venue's half of the exchange. Optional, because a venue that
            // leaves nothing still books somebody — the person just has one
            // fewer way to ask what time to come.
            var (venuePhone, venueTelegram) =
                GigRules.CleanContacts(request?.phone, request?.telegram, required: false);

            reply.VenuePhone = venuePhone;
            reply.VenueTelegram = venueTelegram;

            // The board's bookkeeping, not a lock: filling the last slot flips
            // the listing so the card stops advertising.
            if ((gig.Responses ?? []).Count(row => row.AcceptedAt is not null) >= gig.Slots)
                gig.Status = GigStatus.Filled;

            await _db.SaveChangesAsync(ct);

            // A quiet reply is not booked yet — the venue has said yes and the
            // person still has to. Telling them "вас взяли" would be a lie they
            // only discover by turning up, so it asks instead.
            var quiet = reply.OpenedAt is null;

            await _push.NotifyAsync(
                reply.UserId,
                language => (language, quiet) switch
                {
                    ("ru", true) => ("Вас зовут 🙌", $"«{gig.Title}» — {gig.Venue}, {gig.Date:dd.MM}. Откройте контакты, чтобы договориться."),
                    ("uk", true) => ("Вас кличуть 🙌", $"«{gig.Title}» — {gig.Venue}, {gig.Date:dd.MM}. Відкрийте контакти, щоб домовитись."),
                    (_, true) => ("They want you 🙌", $"“{gig.Title}” — {gig.Venue}, {gig.Date:dd.MM}. Share your contacts to sort it out."),
                    ("ru", _) => ("Вас взяли 🙌", $"«{gig.Title}» — {gig.Venue}, {gig.Date:dd.MM} {gig.StartTime:HH\\:mm}."),
                    ("uk", _) => ("Вас взяли 🙌", $"«{gig.Title}» — {gig.Venue}, {gig.Date:dd.MM} {gig.StartTime:HH\\:mm}."),
                    _ => ("You are in 🙌", $"“{gig.Title}” — {gig.Venue}, {gig.Date:dd.MM} {gig.StartTime:HH\\:mm}."),
                },
                "/gigs",
                ct);
        }

        return Seen(reply, []);
    }

    /// <summary>
    /// The person's own yes: the contacts they held back now go to the venue.
    ///
    /// It does not insist the venue said yes first. The number belongs to the
    /// person, and somebody who changes their mind and wants to be called
    /// should be able to say so rather than sit in a stage waiting for
    /// permission to share their own phone.
    /// </summary>
    public async Task<GigDto> OpenAsync(int userId, int gigId, GigRespondDto request, CancellationToken ct)
    {
        var gig = await _db.GigListings
            .Include(row => row.Responses)
            .FirstOrDefaultAsync(row => row.Id == gigId, ct)
            ?? throw new NotFoundException("Gig does not exist.");

        var reply = (gig.Responses ?? []).FirstOrDefault(row => row.UserId == userId)
            ?? throw new NotFoundException("You have not answered this gig.");

        var (phone, telegram) = GigRules.CleanContacts(request.phone, request.telegram);

        // Opening twice is not an error — it is somebody correcting a typo in
        // their own phone number, and the venue should see the correction.
        var first = reply.OpenedAt is null;

        reply.Phone = phone;
        reply.Telegram = telegram;
        reply.OpenedAt ??= DateTime.UtcNow;

        var me = await _db.Users.FirstOrDefaultAsync(user => user.Id == userId, ct);

        if (me is not null)
        {
            me.ContactPhone = phone ?? me.ContactPhone;
            me.ContactTelegram = telegram ?? me.ContactTelegram;
        }

        await _db.SaveChangesAsync(ct);

        if (first)
        {
            await _push.NotifyAsync(
                gig.OwnerUserId,
                language => language switch
                {
                    "ru" => ("Контакты открыты", $"«{gig.Title}» {gig.Date:dd.MM} — человек согласился, можно звонить."),
                    "uk" => ("Контакти відкриті", $"«{gig.Title}» {gig.Date:dd.MM} — людина погодилась, можна дзвонити."),
                    _ => ("Contacts shared", $"“{gig.Title}” {gig.Date:dd.MM} — they said yes; you can call."),
                },
                "/my-listings",
                ct);
        }

        return ToDto(gig, userId);
    }

    /// <summary>
    /// Venues whose history vouches for them.
    ///
    /// Not a claim made at registration and not a thing anybody can apply for:
    /// enough one-off shifts that actually took place, and nobody who worked
    /// them came back and said it went badly. A badge that can be applied for
    /// is a badge that means whatever the person applying wanted it to mean.
    ///
    /// It comes off by itself. One bad review inside the recent ones takes it
    /// away without anybody deciding to, which is the only kind of automatic
    /// removal that is fair — the same rule that gave it takes it back.
    /// </summary>
    private async Task<HashSet<int>> TrustedAsync(int[] ownerIds, CancellationToken ct)
    {
        if (ownerIds.Length == 0) return [];

        var today = DateOnly.FromDateTime(DateTime.UtcNow);

        // Shifts that were taken and whose day has come and gone. A listing
        // somebody accepted for next Friday has not yet vouched for anybody.
        var done = await _db.GigResponses
            .AsNoTracking()
            .Include(reply => reply.Listing)
            .Where(reply => reply.AcceptedAt != null
                && reply.Listing != null
                && reply.Listing.Date < today
                && ownerIds.Contains(reply.Listing.OwnerUserId))
            .GroupBy(reply => reply.Listing!.OwnerUserId)
            .Select(group => new { Owner = group.Key, Shifts = group.Count() })
            .ToArrayAsync(ct);

        var reviews = await _db.GigReviews
            .AsNoTracking()
            .Where(review => review.ByEmployer == false && ownerIds.Contains(review.TargetUserId))
            .GroupBy(review => review.TargetUserId)
            .Select(group => new
            {
                Owner = group.Key,
                Worst = group.Min(review => review.Rating),
                Count = group.Count(),
            })
            .ToArrayAsync(ct);

        var worst = reviews.ToDictionary(row => row.Owner, row => (row.Worst, row.Count));

        return done
            .Where(row =>
            {
                if (row.Shifts < TrustedShifts) return false;

                // Silence is not endorsement: a venue nobody has reviewed has
                // not been vouched for, however many shifts it has run.
                if (!worst.TryGetValue(row.Owner, out var said) || said.Count < TrustedReviews)
                    return false;

                return said.Worst >= TrustedFloor;
            })
            .Select(row => row.Owner)
            .ToHashSet();
    }

    /// <summary>
    /// Five shifts that happened and three people who came back to rate them,
    /// none below four. Deliberately hard: a badge two venues in the city can
    /// hold means something, and a badge everybody holds is decoration.
    /// </summary>
    private const int TrustedShifts = 5;
    private const int TrustedReviews = 3;
    private const int TrustedFloor = 4;

    /// <summary>
    /// How many times the caller has worked for each of these people, and what
    /// they thought of them.
    ///
    /// Somebody else's stars are an average of strangers. "You worked here
    /// four times and gave them a five" is the reader's own evidence, and it
    /// settles the question before the rating is read at all.
    /// </summary>
    private async Task<Dictionary<int, (int Times, int? Rating)>> HistoryWithAsync(
        int userId, int[] ownerIds, CancellationToken ct)
    {
        if (ownerIds.Length == 0) return [];

        var worked = await _db.GigResponses
            .AsNoTracking()
            .Include(reply => reply.Listing)
            .Where(reply => reply.UserId == userId
                && reply.AcceptedAt != null
                && reply.Listing != null
                && ownerIds.Contains(reply.Listing.OwnerUserId))
            .GroupBy(reply => reply.Listing!.OwnerUserId)
            .Select(group => new { Owner = group.Key, Times = group.Count() })
            .ToArrayAsync(ct);

        var given = await _db.GigReviews
            .AsNoTracking()
            .Where(review => review.AuthorUserId == userId
                && review.ByEmployer == false
                && ownerIds.Contains(review.TargetUserId))
            .GroupBy(review => review.TargetUserId)
            .Select(group => new
            {
                Owner = group.Key,
                Rating = group.OrderByDescending(review => review.CreatedAt).First().Rating,
            })
            .ToArrayAsync(ct);

        var ratings = given.ToDictionary(row => row.Owner, row => row.Rating);

        return worked.ToDictionary(
            row => row.Owner,
            row => (row.Times, ratings.TryGetValue(row.Owner, out var rating) ? rating : (int?)null));
    }

    /// <summary>Average and count per target, one query for a whole card list.</summary>
    private async Task<Dictionary<int, (double Avg, int Count)>> RatingsAsync(
        int[] userIds, bool byEmployer, CancellationToken ct)
    {
        if (userIds.Length == 0) return [];

        var rows = await _db.GigReviews
            .AsNoTracking()
            .Where(review => review.ByEmployer == byEmployer && userIds.Contains(review.TargetUserId))
            .GroupBy(review => review.TargetUserId)
            .Select(group => new { group.Key, Avg = group.Average(review => review.Rating), Count = group.Count() })
            .ToArrayAsync(ct);

        return rows.ToDictionary(row => row.Key, row => (Math.Round(row.Avg, 2), row.Count));
    }

    // ==== Calling back somebody who already worked out ====

    /// <summary>
    /// The people this venue has actually taken before, newest first. The
    /// contacts are the ones they already handed over on those shifts —
    /// nothing new is disclosed by remembering them.
    /// </summary>
    public async Task<KnownWorkerDto[]> KnownWorkersAsync(int userId, CancellationToken ct)
    {
        var replies = await _db.GigResponses
            .AsNoTracking()
            .Include(reply => reply.User)
            .Include(reply => reply.Listing)
            .Where(reply => reply.AcceptedAt != null && reply.Listing!.OwnerUserId == userId)
            .OrderByDescending(reply => reply.Listing!.Date)
            .Take(200)
            .ToArrayAsync(ct);

        var grouped = replies
            .GroupBy(reply => reply.UserId)
            .Select(group => new
            {
                UserId = group.Key,
                Person = group.First().User,
                Times = group.Count(),
                Last = group.Max(reply => reply.Listing!.Date),
                // The freshest contacts they shared, not the oldest — and
                // only ones they did share: a person taken on a quiet reply
                // who never opened theirs has none to remember.
                Phone = group.OrderByDescending(reply => reply.CreatedAt).Select(reply => reply.SharedPhone).FirstOrDefault(value => value != null),
                Telegram = group.OrderByDescending(reply => reply.CreatedAt).Select(reply => reply.SharedTelegram).FirstOrDefault(value => value != null),
            })
            .OrderByDescending(entry => entry.Last)
            .Take(24)
            .ToArray();

        var ratings = await RatingsAsync(grouped.Select(entry => entry.UserId).ToArray(), byEmployer: true, ct);

        return grouped
            .Select(entry => new KnownWorkerDto(
                entry.UserId,
                $"{entry.Person?.FirstName} {entry.Person?.LastName}".Trim(),
                entry.Person?.AvatarKind,
                entry.Person?.AvatarData,
                entry.Times,
                entry.Last.ToString("yyyy-MM-dd"),
                ratings.GetValueOrDefault(entry.UserId).Count > 0 ? ratings[entry.UserId].Avg : null,
                ratings.GetValueOrDefault(entry.UserId).Count,
                entry.Phone,
                entry.Telegram))
            .ToArray();
    }

    /// <summary>
    /// "Come work this one too": a direct push to somebody who worked here
    /// before. It invites, it does not book — the person still answers on
    /// the board, so consent stays theirs.
    /// </summary>
    public async Task InviteAsync(int userId, int listingId, int inviteeUserId, CancellationToken ct)
    {
        var gig = await _db.GigListings
            .Include(row => row.Responses)
            .FirstOrDefaultAsync(row => row.Id == listingId && row.OwnerUserId == userId, ct)
            ?? throw new NotFoundException("Gig does not exist.");

        if (gig.Status != GigStatus.Open)
            throw new ConflictException("This gig is no longer open.");

        var workedHere = await _db.GigResponses
            .AsNoTracking()
            .AnyAsync(reply => reply.UserId == inviteeUserId
                && reply.AcceptedAt != null
                && reply.Listing!.OwnerUserId == userId, ct);

        if (!workedHere)
            throw new ValidationException("You can only call back somebody who has worked with you.");

        if ((gig.Responses ?? []).Any(reply => reply.UserId == inviteeUserId))
            throw new ConflictException("They already answered this one.");

        await _push.NotifyAsync(
            inviteeUserId,
            language => language switch
            {
                "ru" => ("Вас зовут снова 👋", $"{gig.Venue}: «{gig.Title}» {gig.Date:dd.MM}. Откройте подработки."),
                "uk" => ("Вас кличуть знову 👋", $"{gig.Venue}: «{gig.Title}» {gig.Date:dd.MM}. Відкрийте підробітки."),
                _ => ("Called back 👋", $"{gig.Venue}: “{gig.Title}” {gig.Date:dd.MM}. Open the gig board."),
            },
            "/gigs",
            ct);
    }

    // ==== Reviews: reputation earned one shift at a time ====

    /// <summary>
    /// Who may review whom for this listing: the owner reviews accepted
    /// workers, an accepted worker reviews the owner — and only once the
    /// shift's date has passed, because a verdict on work not yet done is
    /// just a mood.
    /// </summary>
    public async Task<ReviewDto> ReviewAsync(int userId, int listingId, ReviewSaveDto request, CancellationToken ct)
    {
        if (request.rating is < 1 or > 5)
            throw new ValidationException("Rating is one to five stars.");

        var gig = await _db.GigListings
            .Include(row => row.Responses)
            .FirstOrDefaultAsync(row => row.Id == listingId, ct)
            ?? throw new NotFoundException("Gig does not exist.");

        if (gig.Date >= DateOnly.FromDateTime(DateTime.UtcNow.Date).AddDays(1))
            throw new ConflictException("Review after the shift, not before.");

        var accepted = (gig.Responses ?? []).Where(reply => reply.AcceptedAt is not null).ToArray();
        bool byEmployer;

        if (gig.OwnerUserId == userId)
        {
            if (accepted.All(reply => reply.UserId != request.target_user_id))
                throw new ValidationException("You can only review somebody you actually took.");

            byEmployer = true;
        }
        else if (accepted.Any(reply => reply.UserId == userId))
        {
            if (request.target_user_id != gig.OwnerUserId)
                throw new ValidationException("A worker reviews the venue that hired them.");

            byEmployer = false;
        }
        else
        {
            throw new ForbiddenException("Reviews belong to the two sides of a worked shift.");
        }

        if (await _db.GigReviews.AnyAsync(
                row => row.ListingId == listingId && row.AuthorUserId == userId && row.TargetUserId == request.target_user_id, ct))
            throw new ConflictException("You already reviewed this one.");

        var review = new GigReview
        {
            ListingId = listingId,
            AuthorUserId = userId,
            TargetUserId = request.target_user_id,
            ByEmployer = byEmployer,
            Rating = request.rating,
            Chips = GigRules.CleanChips(request.chips, byEmployer),
            Text = GigRules.CleanOptional(request.text, GigReview.TextMax, "Text"),
        };

        _db.GigReviews.Add(review);
        await _db.SaveChangesAsync(ct);

        await _push.NotifyAsync(
            request.target_user_id,
            language => language switch
            {
                "ru" => ("Новый отзыв ⭐", $"{review.Rating}/5 за «{gig.Title}»."),
                "uk" => ("Новий відгук ⭐", $"{review.Rating}/5 за «{gig.Title}»."),
                _ => ("A new review ⭐", $"{review.Rating}/5 for “{gig.Title}”."),
            },
            "/gigs",
            ct);

        var author = await _db.Users.AsNoTracking().FirstAsync(user => user.Id == userId, ct);

        return new ReviewDto(
            review.Id, userId, $"{author.FirstName} {author.LastName}".Trim(),
            byEmployer, review.Rating,
            review.Chips?.Split(',') ?? [], review.Text, review.CreatedAt.ToString("O"));
    }

    public async Task<ReputationDto> ReputationAsync(
        int targetUserId,
        int callerUserId,
        CancellationToken ct)
    {
        // Reputation is public to people who could actually be dealing with
        // this person — not to anybody who can count. Without this, walking
        // the id space returned every user's ratings and their ten most recent
        // reviews with each author's real name attached, and doubled as a
        // clean "does this account exist" oracle.
        if (targetUserId != callerUserId && !await OnTheBoardAsync(targetUserId, callerUserId, ct))
            throw new NotFoundException("No such profile.");

        var reviews = await _db.GigReviews
            .AsNoTracking()
            .Where(review => review.TargetUserId == targetUserId)
            .OrderByDescending(review => review.CreatedAt)
            .Take(200)
            .ToArrayAsync(ct);

        var asWorker = reviews.Where(review => review.ByEmployer).ToArray();
        var asEmployer = reviews.Where(review => !review.ByEmployer).ToArray();
        var authorIds = reviews.Take(10).Select(review => review.AuthorUserId).Distinct().ToArray();
        var names = await _db.Users
            .AsNoTracking()
            .Where(user => authorIds.Contains(user.Id))
            .ToDictionaryAsync(user => user.Id, user => $"{user.FirstName} {user.LastName}".Trim(), ct);

        return new ReputationDto(
            asWorker.Length == 0 ? null : Math.Round(asWorker.Average(review => review.Rating), 2),
            asWorker.Length,
            asEmployer.Length == 0 ? null : Math.Round(asEmployer.Average(review => review.Rating), 2),
            asEmployer.Length,
            reviews.Take(10)
                .Select(review => new ReviewDto(
                    review.Id, review.AuthorUserId, names.GetValueOrDefault(review.AuthorUserId, ""),
                    review.ByEmployer, review.Rating, review.Chips?.Split(',') ?? [], review.Text,
                    review.CreatedAt.ToString("O")))
                .ToArray());
    }

    /// <summary>
    /// Whether this person has put themselves in front of the caller: an
    /// active card on the board, a listing of theirs the caller answered, or a
    /// response of theirs to a listing the caller owns. Publishing a card is
    /// consent to be looked up; merely having an account is not.
    /// </summary>
    private async Task<bool> OnTheBoardAsync(int targetUserId, int callerUserId, CancellationToken ct)
    {
        if (await _db.GigSeekers.AnyAsync(
                seeker => seeker.UserId == targetUserId && seeker.IsActive, ct))
        {
            return true;
        }

        if (await _db.GigListings.AnyAsync(
                listing => listing.OwnerUserId == targetUserId
                    && listing.Status != GigStatus.Closed, ct))
        {
            return true;
        }

        // Two sides of a conversation that has already happened.
        if (await _db.GigResponses.AnyAsync(
                response => response.UserId == targetUserId
                    && response.Listing != null
                    && response.Listing.OwnerUserId == callerUserId, ct))
        {
            return true;
        }

        return await _db.GigResponses.AnyAsync(
            response => response.UserId == callerUserId
                && response.Listing != null
                && response.Listing.OwnerUserId == targetUserId, ct);
    }

    /// <summary>The verdicts the caller still owes, both hats at once.</summary>
    public async Task<PendingReviewDto[]> PendingReviewsAsync(int userId, CancellationToken ct)
    {
        var today = DateOnly.FromDateTime(DateTime.UtcNow.Date);
        var written = await _db.GigReviews
            .AsNoTracking()
            .Where(review => review.AuthorUserId == userId)
            .Select(review => new { review.ListingId, review.TargetUserId })
            .ToArrayAsync(ct);
        var done = written.Select(row => (row.ListingId, row.TargetUserId)).ToHashSet();

        // As the employer: accepted workers on my past listings.
        var minePast = await _db.GigListings
            .AsNoTracking()
            .Include(gig => gig.Responses)!
            .ThenInclude(reply => reply.User)
            .Where(gig => gig.OwnerUserId == userId && gig.Date <= today)
            .OrderByDescending(gig => gig.Date)
            .Take(30)
            .ToArrayAsync(ct);

        var pending = new List<PendingReviewDto>();

        foreach (var gig in minePast)
        foreach (var reply in (gig.Responses ?? []).Where(reply => reply.AcceptedAt is not null))
        {
            if (done.Contains((gig.Id, reply.UserId))) continue;

            pending.Add(new PendingReviewDto(
                gig.Id, gig.Title, gig.Date.ToString("yyyy-MM-dd"),
                reply.UserId, $"{reply.User?.FirstName} {reply.User?.LastName}".Trim(), true));
        }

        // As the worker: past listings where my reply was accepted.
        var workedPast = await _db.GigResponses
            .AsNoTracking()
            .Include(reply => reply.Listing)!
            .ThenInclude(gig => gig!.Owner)
            .Where(reply => reply.UserId == userId && reply.AcceptedAt != null && reply.Listing!.Date <= today)
            .OrderByDescending(reply => reply.CreatedAt)
            .Take(30)
            .ToArrayAsync(ct);

        foreach (var reply in workedPast)
        {
            var gig = reply.Listing!;

            if (done.Contains((gig.Id, gig.OwnerUserId))) continue;

            pending.Add(new PendingReviewDto(
                gig.Id, gig.Title, gig.Date.ToString("yyyy-MM-dd"),
                gig.OwnerUserId, gig.Venue, false));
        }

        return pending.Take(20).ToArray();
    }

    // ==== The seekers' side of the board ====

    public async Task<SeekerDto[]> SeekersAsync(
        int userId, string? category, string? city, string? employment, CancellationToken ct)
    {
        var query = _db.GigSeekers
            .AsNoTracking()
            .Include(seeker => seeker.User)
            .Where(seeker => seeker.IsActive);

        if (!string.IsNullOrWhiteSpace(category))
        {
            var name = GigRules.CategoryNames[GigRules.ParseCategory(category)];

            query = query.Where(seeker => seeker.CategoriesCsv.Contains(name));
        }

        if (!string.IsNullOrWhiteSpace(city))
        {
            var needle = city.Trim().ToLower();

            query = query.Where(seeker => seeker.City.ToLower().Contains(needle));
        }

        if (!string.IsNullOrWhiteSpace(employment) && employment != "any")
        {
            var wanted = GigRules.ParseEmployment(employment);

            // Null on a card means "either" — it matches both filters.
            query = query.Where(seeker => seeker.Employment == null || seeker.Employment == wanted);
        }

        var rows = await query
            .OrderByDescending(seeker => seeker.UpdatedAt)
            .Take(200)
            .ToArrayAsync(ct);

        var workerRatings = await RatingsAsync(
            rows.Select(seeker => seeker.UserId).Distinct().ToArray(), byEmployer: true, ct);

        return rows.Select(seeker => ToSeekerDto(seeker, userId, workerRatings)).ToArray();
    }

    public async Task<SeekerDto?> MySeekerAsync(int userId, CancellationToken ct)
    {
        var mine = await _db.GigSeekers
            .AsNoTracking()
            .Include(seeker => seeker.User)
            .FirstOrDefaultAsync(seeker => seeker.UserId == userId, ct);

        if (mine is null) return null;

        var ratings = await RatingsAsync([mine.UserId], byEmployer: true, ct);

        return ToSeekerDto(mine, userId, ratings);
    }

    public async Task<SeekerDto> SaveSeekerAsync(int userId, SeekerSaveDto request, CancellationToken ct)
    {
        var categories = GigRules.CleanSeekerCategories(request.categories);
        var city = GigRules.CleanRequired(request.city, GigListing.CityMax, "City");
        var about = GigRules.CleanOptional(request.about, GigSeeker.AboutMax, "About");
        var availability = GigRules.CleanOptional(request.availability, GigSeeker.AvailabilityMax, "Availability");
        var phone = GigRules.CleanOptional(request.phone, GigResponse.ContactMax, "Phone");
        var telegram = GigRules.CleanOptional(request.telegram, GigResponse.ContactMax, "Telegram");

        if (request.is_active && phone is null && telegram is null)
            throw new ValidationException("An active card needs a phone or a Telegram — employers have to reach you.");

        GigEmployment? employment = request.employment?.Trim().ToLowerInvariant() switch
        {
            null or "" or "any" => null,
            var value => GigRules.ParseEmployment(value),
        };

        string? period = null;

        if (request.pay_amount is > 0)
            period = GigRules.ParsePayPeriod(request.pay_period);

        var seeker = await _db.GigSeekers.FirstOrDefaultAsync(row => row.UserId == userId, ct);

        if (seeker is null)
        {
            seeker = new GigSeeker { UserId = userId, CategoriesCsv = categories, City = city };
            _db.GigSeekers.Add(seeker);
        }

        seeker.CategoriesCsv = categories;
        seeker.City = city;
        seeker.About = about;
        seeker.Availability = availability;
        seeker.PayAmount = request.pay_amount is > 0 ? request.pay_amount : null;
        seeker.PayPeriod = period;
        seeker.Phone = phone;
        seeker.Telegram = telegram;
        seeker.Employment = employment;
        seeker.IsActive = request.is_active;
        seeker.UpdatedAt = DateTime.UtcNow;

        await _db.SaveChangesAsync(ct);

        var loaded = await _db.GigSeekers.AsNoTracking().Include(row => row.User).FirstAsync(row => row.Id == seeker.Id, ct);

        var savedRatings = await RatingsAsync([loaded.UserId], byEmployer: true, ct);

        return ToSeekerDto(loaded, userId, savedRatings);
    }

    private static SeekerDto ToSeekerDto(GigSeeker seeker, int userId, Dictionary<int, (double Avg, int Count)>? ratings = null) => new(
        seeker.Id,
        seeker.UserId,
        $"{seeker.User?.FirstName} {seeker.User?.LastName}".Trim(),
        seeker.User?.AvatarKind,
        seeker.User?.AvatarData,
        seeker.CategoriesCsv.Split(',', StringSplitOptions.RemoveEmptyEntries),
        seeker.Employment switch { GigEmployment.Freelance => "freelance", GigEmployment.Permanent => "permanent", _ => "any" },
        seeker.City,
        seeker.About,
        seeker.Availability,
        seeker.PayAmount,
        seeker.PayPeriod,
        seeker.Phone,
        seeker.Telegram,
        seeker.IsActive,
        seeker.UserId == userId,
        ratings?.GetValueOrDefault(seeker.UserId).Count > 0 ? ratings[seeker.UserId].Avg : null,
        ratings?.GetValueOrDefault(seeker.UserId).Count ?? 0,
        seeker.UpdatedAt.ToString("O"));

    /// <summary>
    /// What the caller's own hours have been worth lately. Three months rather
    /// than everything: a rate from two years ago is not what they would be
    /// giving up tonight.
    /// </summary>
    private async Task<LocationTotalDto[]> MyHoursAsync(int userId, CancellationToken ct)
    {
        DateOnly today = DateOnly.FromDateTime(DateTime.UtcNow);

        Day[] days = await _db.Days
            .AsNoTracking()
            .Include(day => day.Shifts!).ThenInclude(entry => entry.Shift)
            .Include(day => day.Sales!).ThenInclude(sale => sale.Sales)
            .Where(day => day.UserId == userId
                && day.Date >= today.AddMonths(-3)
                && day.Date <= today)
            .ToArrayAsync(ct);

        Location[] places = await _db.Locations
            .AsNoTracking()
            .Where(place => place.UserId == userId)
            .ToArrayAsync(ct);

        return DayHandler.ByLocation(days, places.ToDictionary(place => place.Id));
    }

    private static GigDto ToDto(
        GigListing gig,
        int userId,
        Dictionary<int, (double Avg, int Count)>? employerRatings = null,
        LocationTotalDto[]? mineByPlace = null,
        /// <summary>The reader's own history with each employer, by owner id.</summary>
        Dictionary<int, (int Times, int? Rating)>? history = null,
        /// <summary>Owners whose own history vouches for them.</summary>
        HashSet<int>? trusted = null)
    {
        var mine = (gig.Responses ?? []).FirstOrDefault(reply => reply.UserId == userId);

        string[] photos;

        try
        {
            photos = System.Text.Json.JsonSerializer.Deserialize<string[]>(gig.PhotosJson) ?? [];
        }
        catch
        {
            photos = [];
        }

        return new GigDto(
            gig.Id,
            gig.Venue,
            GigRules.CategoryNames[gig.Category],
            gig.Employment == GigEmployment.Permanent ? "permanent" : "freelance",
            photos,
            gig.Schedule,
            gig.Title,
            gig.Details,
            gig.Date.ToString("yyyy-MM-dd"),
            gig.StartTime.ToString("HH:mm"),
            gig.EndTime.ToString("HH:mm"),
            gig.PayAmount,
            gig.PayPeriod,
            gig.PayPercent,
            gig.City,
            gig.Slots,
            gig.Status switch { GigStatus.Open => "open", GigStatus.Filled => "filled", _ => "closed" },
            gig.CreatedAt.ToString("O"),
            employerRatings?.GetValueOrDefault(gig.OwnerUserId).Avg is double avg and > 0 ? avg : null,
            employerRatings?.GetValueOrDefault(gig.OwnerUserId).Count ?? 0,
            (gig.Responses ?? []).Count,
            gig.OwnerUserId == userId,
            mine is null
                ? null
                : new GigMyResponseDto(
                    mine.Id,
                    mine.AcceptedAt is not null,
                    mine.Stage,
                    // Only once the venue has actually picked them. Before
                    // that there is nothing to show, and after it the person
                    // finally has a way to ask what time to come.
                    mine.AcceptedAt is null ? null : mine.VenuePhone,
                    mine.AcceptedAt is null ? null : mine.VenueTelegram),
            // Only to the owner: it is the one person who needs to hand the
            // link out, and giving it to every reader would make the board
            // countable again by another route.
            gig.OwnerUserId == userId ? gig.ShareSlug : null,
            // What this shift is worth against the hours they already work.
            // 250 an hour is generous in one city and a pay cut in another,
            // and which of those it is depends entirely on the reader.
            mineByPlace is null
                ? null
                : GigWorth.Judge(
                    gig.PayAmount,
                    gig.PayPeriod,
                    PremiumCalculator.Span(gig.StartTime, gig.EndTime),
                    mineByPlace),
            // Urgent only while it is still today and the shift has not
            // started. A board full of yesterday's emergencies is a board
            // nobody checks, and the word stops meaning anything.
            gig.Urgent && gig.Date == DateOnly.FromDateTime(DateTime.UtcNow),
            // Their own history with this venue. Somebody else's average is a
            // stranger's opinion; four evenings of their own is evidence.
            history?.GetValueOrDefault(gig.OwnerUserId).Times ?? 0,
            history?.GetValueOrDefault(gig.OwnerUserId).Rating,
            trusted?.Contains(gig.OwnerUserId) ?? false);
    }
}
