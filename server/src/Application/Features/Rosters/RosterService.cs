using Microsoft.EntityFrameworkCore;

using Shifter.Application.Common.Exceptions;
using Shifter.Application.Common.Time;
using Shifter.Domain.Entities;
using Shifter.Infrastructure.Persistence.DbContexts;

namespace Shifter.Application.Features.Rosters;

/// <summary>Rosters, written by their owner and read at a link. Nothing here reaches a calendar, a day or a team: that separation is the feature.</summary>
public sealed class RosterService
{
    /// <summary>First half of an advisory lock's key: an owner's rosters are counted under one, a roster's people under the other.</summary>
    private const int OwnersRosters = 1;
    private const int RostersPeople = 2;

    private readonly ShifterDbContext _db;
    private readonly AppClock _clock;

    public RosterService(ShifterDbContext db, AppClock clock)
    {
        _db = db;
        _clock = clock;
    }

    // ==== Access ====

    /// <summary>Yours, or not there. Somebody else's answers exactly as a missing one does, so an id proves nothing to whoever guessed it.</summary>
    private async Task<Roster> OwnedAsync(int rosterId, int userId, CancellationToken ct)
        => await _db.Rosters.FirstOrDefaultAsync(row => row.Id == rosterId && row.UserId == userId, ct)
            ?? throw new NotFoundException("Roster does not exist.");

    private async Task<RosterPerson> PersonAsync(int rosterId, int personId, CancellationToken ct)
        => await _db.RosterPeople.FirstOrDefaultAsync(row => row.Id == personId && row.RosterId == rosterId, ct)
            ?? throw new NotFoundException("Person does not exist.");

    /// <summary>One more go where two saves met on the unique key or one removed what the other was changing: the second read sees the first's work, and the later write wins.</summary>
    private async Task<T> RetriedAsync<T>(Func<Task<T>> write)
    {
        try
        {
            return await write();
        }
        catch (DbUpdateException)
        {
            _db.ChangeTracker.Clear();

            return await write();
        }
    }

    /// <summary>A count and the insert it allows, as one step. Two requests counting at once would both see room, so each holds the lock until its insert is committed, and the next counts what that one left.</summary>
    private Task<T> WithinLimitAsync<T>(int lockFamily, int parentId, Func<Task<T>> write, CancellationToken ct)
        => _db.Database.CreateExecutionStrategy().ExecuteAsync(async () =>
        {
            // A retry starts over, and must not find the last attempt's row waiting.
            _db.ChangeTracker.Clear();

            await using var transaction = await _db.Database.BeginTransactionAsync(ct);

            await _db.Database.ExecuteSqlInterpolatedAsync($"SELECT pg_advisory_xact_lock({lockFamily}, {parentId})", ct);

            T written = await write();

            await transaction.CommitAsync(ct);

            return written;
        });

    // ==== Rosters ====

    public async Task<RosterDto[]> ListAsync(int userId, CancellationToken ct)
    {
        var rosters = await _db.Rosters
            .AsNoTracking()
            .Include(row => row.People)
            .Where(row => row.UserId == userId)
            .OrderBy(row => row.Id)
            .ToArrayAsync(ct);

        return rosters.Select(ToDto).ToArray();
    }

    public async Task<RosterDto> CreateAsync(int userId, RosterSaveDto? request, CancellationToken ct)
    {
        string title = RosterRules.CleanTitle(request?.title);

        return await WithinLimitAsync(OwnersRosters, userId, async () =>
        {
            if (await _db.Rosters.CountAsync(row => row.UserId == userId, ct) >= Roster.MaxPerOwner)
                throw new ValidationException($"A person can keep at most {Roster.MaxPerOwner} rosters.");

            var roster = new Roster
            {
                UserId = userId,
                Title = title,
                CreatedAtUtc = _clock.UtcNow,
                UpdatedAtUtc = _clock.UtcNow,
            };

            _db.Rosters.Add(roster);

            await _db.SaveChangesAsync(ct);

            return ToDto(roster);
        }, ct);
    }

    public async Task<RosterDto> RenameAsync(int rosterId, int userId, RosterSaveDto? request, CancellationToken ct)
    {
        Roster roster = await OwnedAsync(rosterId, userId, ct);

        roster.Title = RosterRules.CleanTitle(request?.title);
        roster.UpdatedAtUtc = _clock.UtcNow;

        await _db.SaveChangesAsync(ct);

        await _db.Entry(roster).Collection(row => row.People!).LoadAsync(ct);

        return ToDto(roster);
    }

    public async Task DeleteAsync(int rosterId, int userId, CancellationToken ct)
    {
        Roster roster = await OwnedAsync(rosterId, userId, ct);

        _db.Rosters.Remove(roster);

        await _db.SaveChangesAsync(ct);
    }

    public async Task<RosterMonthDto> MonthAsync(int rosterId, int userId, string? month, CancellationToken ct)
    {
        Roster roster = await OwnedAsync(rosterId, userId, ct);

        DateOnly from = RosterRules.RequireMonth(month);
        DateOnly to = RosterRules.LastDay(from);

        var people = await _db.RosterPeople
            .AsNoTracking()
            .Where(row => row.RosterId == rosterId)
            .OrderBy(row => row.Id)
            .ToArrayAsync(ct);

        var shifts = await _db.RosterShifts
            .AsNoTracking()
            .Where(row => row.RosterId == rosterId && row.Date >= from && row.Date <= to)
            .OrderBy(row => row.Date)
            .ThenBy(row => row.RosterPersonId)
            .ToArrayAsync(ct);

        return new RosterMonthDto(
            roster.Id,
            roster.Title,
            roster.ShareSlug,
            from.ToString("yyyy-MM"),
            people.Select(ToDto).ToArray(),
            shifts.Select(ToDto).ToArray());
    }

    // ==== People ====

    public Task<RosterPersonDto> AddPersonAsync(
        int rosterId, int userId, RosterPersonSaveDto? request, CancellationToken ct)
        => WithinLimitAsync(RostersPeople, rosterId, async () =>
        {
            Roster roster = await OwnedAsync(rosterId, userId, ct);

            var person = new RosterPerson
            {
                RosterId = rosterId,
                Name = RosterRules.CleanName(request?.name),
                Position = RosterRules.CleanPosition(request?.position),
                Colour = RosterRules.RequireColour(request?.colour),
            };

            if (await _db.RosterPeople.CountAsync(row => row.RosterId == rosterId, ct) >= Roster.MaxPeople)
                throw new ValidationException($"A roster holds at most {Roster.MaxPeople} people.");

            _db.RosterPeople.Add(person);
            roster.UpdatedAtUtc = _clock.UtcNow;

            await _db.SaveChangesAsync(ct);

            return ToDto(person);
        }, ct);

    public async Task<RosterPersonDto> UpdatePersonAsync(
        int rosterId, int userId, int personId, RosterPersonSaveDto? request, CancellationToken ct)
    {
        Roster roster = await OwnedAsync(rosterId, userId, ct);
        RosterPerson person = await PersonAsync(rosterId, personId, ct);

        person.Name = RosterRules.CleanName(request?.name);
        person.Position = RosterRules.CleanPosition(request?.position);
        person.Colour = RosterRules.RequireColour(request?.colour);
        roster.UpdatedAtUtc = _clock.UtcNow;

        await _db.SaveChangesAsync(ct);

        return ToDto(person);
    }

    public async Task DeletePersonAsync(int rosterId, int userId, int personId, CancellationToken ct)
    {
        Roster roster = await OwnedAsync(rosterId, userId, ct);
        RosterPerson person = await PersonAsync(rosterId, personId, ct);

        _db.RosterPeople.Remove(person);
        roster.UpdatedAtUtc = _clock.UtcNow;

        await _db.SaveChangesAsync(ct);
    }

    // ==== Cells ====

    /// <summary>One save, so the batch lands whole or not at all.</summary>
    public Task SaveCellsAsync(int rosterId, int userId, RosterCellsDto? request, CancellationToken ct)
        => RetriedAsync(async () =>
        {
            Roster roster = await OwnedAsync(rosterId, userId, ct);

            RosterCell[] cells = RosterRules.ReadBatch(request);

            var people = await _db.RosterPeople
                .Where(row => row.RosterId == rosterId)
                .Select(row => row.Id)
                .ToHashSetAsync(ct);

            if (cells.Any(cell => !people.Contains(cell.PersonId)))
                throw new NotFoundException("Person does not exist.");

            var dates = cells.Select(cell => cell.Date).Distinct().ToArray();

            var existing = await _db.RosterShifts
                .Where(row => row.RosterId == rosterId && dates.Contains(row.Date))
                .ToDictionaryAsync(row => (row.RosterPersonId, row.Date), ct);

            foreach (RosterCell cell in cells)
            {
                existing.TryGetValue((cell.PersonId, cell.Date), out RosterShift? shift);

                if (cell.Start is not TimeOnly start || cell.End is not TimeOnly end)
                {
                    if (shift is not null) _db.RosterShifts.Remove(shift);

                    continue;
                }

                if (shift is null)
                {
                    _db.RosterShifts.Add(new RosterShift
                    {
                        RosterId = rosterId,
                        RosterPersonId = cell.PersonId,
                        Date = cell.Date,
                        StartTime = start,
                        EndTime = end,
                    });

                    continue;
                }

                shift.StartTime = start;
                shift.EndTime = end;
            }

            roster.UpdatedAtUtc = _clock.UtcNow;

            return await _db.SaveChangesAsync(ct);
        });

    /// <summary>Fills a month from the one before it. Only an empty cell takes a shift; added and kept together are what the month ends up holding.</summary>
    public Task<RosterRepeatedDto> RepeatAsync(
        int rosterId, int userId, RosterRepeatDto? request, CancellationToken ct)
        => RetriedAsync(async () =>
        {
            Roster roster = await OwnedAsync(rosterId, userId, ct);

            DateOnly first = RosterRules.RequireMonth(request?.month);
            DateOnly last = RosterRules.LastDay(first);
            DateOnly sourceFirst = first.AddMonths(-1);

            var rows = await _db.RosterShifts
                .AsNoTracking()
                .Where(row => row.RosterId == rosterId && row.Date >= sourceFirst && row.Date <= last)
                .ToArrayAsync(ct);

            var filled = rows
                .Where(row => row.Date >= first)
                .Select(row => (row.RosterPersonId, row.Date))
                .ToHashSet();

            var source = rows.Where(row => row.Date < first).ToLookup(row => row.Date);

            int added = 0;

            for (DateOnly date = first; date <= last; date = date.AddDays(1))
            {
                foreach (RosterShift shift in source[RosterRules.SourceOf(date)])
                {
                    if (filled.Contains((shift.RosterPersonId, date))) continue;

                    _db.RosterShifts.Add(new RosterShift
                    {
                        RosterId = rosterId,
                        RosterPersonId = shift.RosterPersonId,
                        Date = date,
                        StartTime = shift.StartTime,
                        EndTime = shift.EndTime,
                    });

                    added++;
                }
            }

            if (added > 0) roster.UpdatedAtUtc = _clock.UtcNow;

            await _db.SaveChangesAsync(ct);

            return new RosterRepeatedDto(added, filled.Count);
        });

    // ==== The link ====

    /// <summary>Turns the link on. A slug already out there is replaced, which is what kills it.</summary>
    public Task<RosterShareDto> ShareAsync(int rosterId, int userId, CancellationToken ct)
        => RetriedAsync(async () =>
        {
            Roster roster = await OwnedAsync(rosterId, userId, ct);

            string slug = GigListing.NewSlug();

            roster.ShareSlug = slug;
            roster.UpdatedAtUtc = _clock.UtcNow;

            await _db.SaveChangesAsync(ct);

            return new RosterShareDto(slug);
        });

    public async Task UnshareAsync(int rosterId, int userId, CancellationToken ct)
    {
        Roster roster = await OwnedAsync(rosterId, userId, ct);

        roster.ShareSlug = null;
        roster.UpdatedAtUtc = _clock.UtcNow;

        await _db.SaveChangesAsync(ct);
    }

    /// <summary>What a link shows for a month, the current one where none was named, or null where the slug opens nothing. Six reads, however many people are on it.</summary>
    public async Task<RosterPageRead?> PageAsync(string slug, string? shown, CancellationToken ct)
    {
        var roster = await _db.Rosters
            .AsNoTracking()
            .Where(row => row.ShareSlug == slug)
            .Select(row => new { row.Id, row.UserId, row.Title })
            .FirstOrDefaultAsync(ct);

        if (roster is null) return null;

        // The page has no script to ask the reader's clock, and the crew works
        // where the owner does, so today is the owner's date and not the server's.
        var zones = await UserZones.OfAsync(_db, [roster.UserId], ct);
        DateOnly today = DateOnly.FromDateTime(TimeZoneInfo.ConvertTimeFromUtc(
            _clock.UtcNow, _clock.ZoneOr(zones.GetValueOrDefault(roster.UserId))));

        DateOnly month = RosterRules.TryMonth(shown) ?? new DateOnly(today.Year, today.Month, 1);
        DateOnly last = RosterRules.LastDay(month);

        var people = await _db.RosterPeople
            .AsNoTracking()
            .Where(row => row.RosterId == roster.Id)
            .OrderBy(row => row.Id)
            .Select(row => new { row.Id, row.Name, row.Position, row.Colour })
            .ToArrayAsync(ct);

        var shifts = await _db.RosterShifts
            .AsNoTracking()
            .Where(row => row.RosterId == roster.Id && row.Date >= month && row.Date <= last)
            .Select(row => new { row.RosterPersonId, row.Date, row.StartTime, row.EndTime })
            .ToArrayAsync(ct);

        var byPerson = shifts.ToLookup(row => row.RosterPersonId);

        return new RosterPageRead(
            roster.Title,
            month,
            today,
            people
                .Select(person => new RosterPagePerson(
                    person.Name,
                    person.Position,
                    person.Colour,
                    byPerson[person.Id]
                        .Select(row => new RosterPageShift(row.Date, row.StartTime, row.EndTime))
                        .ToArray()))
                .ToArray());
    }

    private static RosterDto ToDto(Roster roster)
        => new(
            roster.Id,
            roster.Title,
            roster.ShareSlug,
            (roster.People ?? []).OrderBy(person => person.Id).Select(ToDto).ToArray());

    private static RosterPersonDto ToDto(RosterPerson person)
        => new(person.Id, person.Name, person.Position, person.Colour);

    private static RosterShiftDto ToDto(RosterShift shift)
        => new(
            shift.RosterPersonId,
            shift.Date.ToString("yyyy-MM-dd"),
            shift.StartTime.ToString("HH:mm"),
            shift.EndTime.ToString("HH:mm"));
}
