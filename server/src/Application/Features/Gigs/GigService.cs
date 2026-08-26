using Microsoft.EntityFrameworkCore;

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

    public GigService(ShifterDbContext db, IPushNotifier push)
    {
        _db = db;
        _push = push;
    }

    public async Task<GigDto[]> BoardAsync(
        int userId, DateOnly from, DateOnly to, string? category, string? city, CancellationToken ct)
    {
        if (to < from) (from, to) = (to, from);
        if (to.DayNumber - from.DayNumber > 400)
            throw new ValidationException("At most a year and a bit at a time.");

        var query = _db.GigListings
            .AsNoTracking()
            .Include(gig => gig.Responses)
            .Where(gig => gig.Date >= from && gig.Date <= to && gig.Status != GigStatus.Closed);

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

        return rows.Select(gig => ToDto(gig, userId)).ToArray();
    }

    public async Task<GigDto> SaveAsync(int userId, int? id, GigSaveDto request, CancellationToken ct)
    {
        var venue = GigRules.CleanRequired(request.venue, GigListing.VenueMax, "Venue");
        var title = GigRules.CleanRequired(request.title, GigListing.TitleMax, "Title");
        var city = GigRules.CleanRequired(request.city, GigListing.CityMax, "City");
        var details = GigRules.CleanOptional(request.details, GigListing.DetailsMax, "Details");
        var category = GigRules.ParseCategory(request.category);
        var period = GigRules.ParsePayPeriod(request.pay_period);
        var (start, end) = GigRules.ParseSlot(request.start, request.end);

        if (!DateOnly.TryParseExact(request.date, "yyyy-MM-dd", out var date))
            throw new ValidationException("date must be yyyy-MM-dd.");

        if (request.pay_amount <= 0)
            throw new ValidationException("The pay has to be above zero.");

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
        gig.City = city;
        gig.Slots = request.slots;

        await _db.SaveChangesAsync(ct);

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

        return rows.Select(gig => new GigWithResponsesDto(
            ToDto(gig, userId),
            (gig.Responses ?? [])
                .OrderBy(reply => reply.CreatedAt)
                .Select(reply => new GigResponseDto(
                    reply.Id,
                    reply.UserId,
                    $"{reply.User?.FirstName} {reply.User?.LastName}".Trim(),
                    reply.User?.AvatarKind,
                    reply.User?.AvatarData,
                    reply.Message,
                    reply.Phone,
                    reply.Telegram,
                    reply.AcceptedAt is not null,
                    reply.CreatedAt.ToString("O")))
                .ToArray()))
            .ToArray();
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
            .Select(reply => ToDto(reply.Listing!, userId))
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

        var (phone, telegram) = GigRules.CleanContacts(request.phone, request.telegram);
        var message = GigRules.CleanOptional(request.message, GigResponse.MessageMax, "Message");

        _db.GigResponses.Add(new GigResponse
        {
            ListingId = gig.Id,
            UserId = userId,
            Message = message,
            Phone = phone,
            Telegram = telegram,
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
            language => language switch
            {
                "ru" => ("Отклик на подработку", $"«{gig.Title}» {gig.Date:dd.MM} — новый человек готов выйти."),
                "uk" => ("Відгук на підробіток", $"«{gig.Title}» {gig.Date:dd.MM} — нова людина готова вийти."),
                _ => ("A reply to your gig", $"“{gig.Title}” {gig.Date:dd.MM} — somebody is in."),
            },
            "/gigs",
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

    public async Task<GigResponseDto> AcceptAsync(int userId, int gigId, int replyId, CancellationToken ct)
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

            // The board's bookkeeping, not a lock: filling the last slot flips
            // the listing so the card stops advertising.
            if ((gig.Responses ?? []).Count(row => row.AcceptedAt is not null) >= gig.Slots)
                gig.Status = GigStatus.Filled;

            await _db.SaveChangesAsync(ct);

            await _push.NotifyAsync(
                reply.UserId,
                language => language switch
                {
                    "ru" => ("Вас взяли 🙌", $"«{gig.Title}» — {gig.Venue}, {gig.Date:dd.MM} {gig.StartTime:HH\\:mm}."),
                    "uk" => ("Вас взяли 🙌", $"«{gig.Title}» — {gig.Venue}, {gig.Date:dd.MM} {gig.StartTime:HH\\:mm}."),
                    _ => ("You are in 🙌", $"“{gig.Title}” — {gig.Venue}, {gig.Date:dd.MM} {gig.StartTime:HH\\:mm}."),
                },
                "/gigs",
                ct);
        }

        return new GigResponseDto(
            reply.Id, reply.UserId,
            $"{reply.User?.FirstName} {reply.User?.LastName}".Trim(),
            reply.User?.AvatarKind, reply.User?.AvatarData,
            reply.Message, reply.Phone, reply.Telegram,
            true, reply.CreatedAt.ToString("O"));
    }

    private static GigDto ToDto(GigListing gig, int userId)
    {
        var mine = (gig.Responses ?? []).FirstOrDefault(reply => reply.UserId == userId);

        return new GigDto(
            gig.Id,
            gig.Venue,
            GigRules.CategoryNames[gig.Category],
            gig.Title,
            gig.Details,
            gig.Date.ToString("yyyy-MM-dd"),
            gig.StartTime.ToString("HH:mm"),
            gig.EndTime.ToString("HH:mm"),
            gig.PayAmount,
            gig.PayPeriod,
            gig.City,
            gig.Slots,
            gig.Status switch { GigStatus.Open => "open", GigStatus.Filled => "filled", _ => "closed" },
            (gig.Responses ?? []).Count,
            gig.OwnerUserId == userId,
            mine is null ? null : new GigMyResponseDto(mine.Id, mine.AcceptedAt is not null));
    }
}
