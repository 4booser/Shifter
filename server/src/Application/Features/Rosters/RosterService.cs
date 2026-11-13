using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Query;

using Npgsql;

using Shifter.Application.Common.Exceptions;
using Shifter.Application.Common.Time;
using Shifter.Domain.Entities;
using Shifter.Infrastructure.Persistence.DbContexts;

namespace Shifter.Application.Features.Rosters;

/// <summary>Rosters, written by their owner and read at a link. Nothing here reaches a calendar, a day or a team: that separation is the feature.</summary>
public sealed class RosterService
{
    /// <summary>First half of an advisory lock's key: an owner's rosters are counted under one, a roster's people under another, and everything that changes or reads a roster's usual hours before it writes under the third, along with the two that fill a month in one go and the delete that takes the roster away under them. Taken people then defaults, never the other way, so two saves cannot wait on each other.</summary>
    private const int OwnersRosters = 1;
    private const int RostersPeople = 2;
    private const int RostersDefaults = 3;

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

    /// <summary>The same answer with no row kept, for the writes that take no lock: they change the roster's own row only through <see cref="TouchAsync"/>.</summary>
    private async Task OwnsAsync(int rosterId, int userId, CancellationToken ct)
    {
        if (!await _db.Rosters.AnyAsync(row => row.Id == rosterId && row.UserId == userId, ct))
            throw new NotFoundException("Roster does not exist.");
    }

    /// <summary>Stamps the roster changed, with any column of its own the write names, in one statement. A tracked roster saved for its stamp writes an empty venue list back with it, so a write that takes no lock and lands beside a first venue save would quietly put the empty list back after the owner was told the hours were saved.</summary>
    private Task TouchAsync(int rosterId, CancellationToken ct, Action<UpdateSettersBuilder<Roster>>? also = null)
        => _db.Rosters
            .Where(row => row.Id == rosterId)
            .ExecuteUpdateAsync(set =>
            {
                set.SetProperty(row => row.UpdatedAtUtc, _clock.UtcNow);
                also?.Invoke(set);
            }, ct);

    private async Task<RosterPerson> PersonAsync(int rosterId, int personId, CancellationToken ct)
        => await _db.RosterPeople.FirstOrDefaultAsync(row => row.Id == personId && row.RosterId == rosterId, ct)
            ?? throw new NotFoundException("Person does not exist.");

    private async Task<RosterPosition> PositionAsync(int rosterId, int positionId, CancellationToken ct)
        => await _db.RosterPositions.FirstOrDefaultAsync(row => row.Id == positionId && row.RosterId == rosterId, ct)
            ?? throw new NotFoundException("Position does not exist.");

    /// <summary>The date on the owner's clock, the way the link page reads it. Fill, clear and restamp go by it, so the days already lived through stay as they were.</summary>
    private async Task<DateOnly> OwnersTodayAsync(int userId, CancellationToken ct)
    {
        var zones = await UserZones.OfAsync(_db, [userId], ct);

        return DateOnly.FromDateTime(TimeZoneInfo.ConvertTimeFromUtc(
            _clock.UtcNow, _clock.ZoneOr(zones.GetValueOrDefault(userId))));
    }

    /// <summary>One more go where two saves met on the unique key or one removed what the other was changing: the second read sees the first's work, and the later write wins. A statement meets the key with the database's own error rather than EF's.</summary>
    private async Task<T> RetriedAsync<T>(Func<Task<T>> write)
    {
        try
        {
            return await write();
        }
        catch (Exception error) when (error is DbUpdateException or PostgresException { SqlState: PostgresErrorCodes.UniqueViolation })
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
        // Split, because twenty rosters of sixty people and twenty positions
        // joined in one go is a cartesian nobody needs.
        var rosters = await _db.Rosters
            .AsNoTracking()
            .Include(row => row.People)
            .Include(row => row.Positions)
            .AsSplitQuery()
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
        await OwnsAsync(rosterId, userId, ct);

        string title = RosterRules.CleanTitle(request?.title);

        await TouchAsync(rosterId, ct, set => set.SetProperty(row => row.Title, title));

        var roster = await _db.Rosters
            .AsNoTracking()
            .Include(row => row.People)
            .Include(row => row.Positions)
            .AsSplitQuery()
            .FirstOrDefaultAsync(row => row.Id == rosterId, ct)
            ?? throw new NotFoundException("Roster does not exist.");

        return ToDto(roster);
    }

    /// <summary>Under the defaults lock, so a fill or a repeat under way writes its month before the roster goes, rather than meeting the roster gone from under its foreign keys.</summary>
    public Task DeleteAsync(int rosterId, int userId, CancellationToken ct)
        => WithinLimitAsync(RostersDefaults, rosterId, async () =>
        {
            Roster roster = await OwnedAsync(rosterId, userId, ct);

            _db.Rosters.Remove(roster);

            return await _db.SaveChangesAsync(ct);
        }, ct);

    /// <summary>A month as the owner's screens read it. A day with no set time goes out only to a caller that asks for bare days: a build from before them reads a null time and falls over.</summary>
    public async Task<RosterMonthDto> MonthAsync(int rosterId, int userId, string? month, bool bare, CancellationToken ct)
    {
        Roster roster = await OwnedAsync(rosterId, userId, ct);

        DateOnly from = RosterRules.RequireMonth(month);
        DateOnly to = RosterRules.LastDay(from);

        var people = await _db.RosterPeople
            .AsNoTracking()
            .Where(row => row.RosterId == rosterId)
            .OrderBy(row => row.Id)
            .ToArrayAsync(ct);

        var positions = await _db.RosterPositions
            .AsNoTracking()
            .Where(row => row.RosterId == rosterId)
            .OrderBy(row => row.Id)
            .ToArrayAsync(ct);

        var shifts = await _db.RosterShifts
            .AsNoTracking()
            .Where(row => row.RosterId == rosterId && row.Date >= from && row.Date <= to)
            .Where(row => bare || row.StartTime != null)
            .OrderBy(row => row.Date)
            .ThenBy(row => row.RosterPersonId)
            .ToArrayAsync(ct);

        return new RosterMonthDto(
            roster.Id,
            roster.Title,
            roster.ShareSlug,
            from.ToString("yyyy-MM"),
            RosterRules.WeekDto(roster.VenueHours),
            positions.Select(RosterRules.PositionDto).ToArray(),
            people.Select(person => RosterRules.PersonDto(person, positions)).ToArray(),
            shifts.Select(RosterRules.ShiftDto).ToArray());
    }

    // ==== Usual hours ====

    /// <summary>Replaces the venue's week, and moves the shifts to come that sat at the hours it used to give.</summary>
    public Task<RosterVenueSavedDto> SaveVenueHoursAsync(
        int rosterId, int userId, RosterVenueSaveDto? request, CancellationToken ct)
        => WithinLimitAsync(RostersDefaults, rosterId, async () =>
        {
            Roster roster = await OwnedAsync(rosterId, userId, ct);

            if (request?.venue_hours is null) throw new ValidationException("venue_hours is required.");

            List<WeekdayHours> week = RosterRules.ReadWeek(request.venue_hours);

            RosterDefaults before = await DefaultsAsync(roster, ct);

            roster.VenueHours = week;
            roster.UpdatedAtUtc = _clock.UtcNow;

            await _db.SaveChangesAsync(ct);

            int restamped = await RestampedAsync(roster, before, before with { Venue = week }, ct);

            return new RosterVenueSavedDto(RosterRules.WeekDto(week), restamped);
        }, ct);

    /// <summary>A new position takes no set time unless told otherwise. Nobody is on it yet, so nothing moves.</summary>
    public Task<RosterPositionDto> AddPositionAsync(
        int rosterId, int userId, RosterPositionSaveDto? request, CancellationToken ct)
        => WithinLimitAsync(RostersDefaults, rosterId, async () =>
        {
            Roster roster = await OwnedAsync(rosterId, userId, ct);

            var position = new RosterPosition
            {
                RosterId = rosterId,
                Name = RosterRules.ReadPositionName(request?.name),
            };

            if (request?.hours is not null) RosterRules.ApplyPositionHours(position, request.hours);

            var names = await PositionNamesAsync(rosterId, ct);

            if (names.Any(known => RosterRules.PositionKey(known.Name) == RosterRules.PositionKey(position.Name)))
                throw new ValidationException("A position with that name is already on this roster.");

            if (names.Length >= Roster.MaxPositions)
                throw new ValidationException($"A roster holds at most {Roster.MaxPositions} positions.");

            _db.RosterPositions.Add(position);
            roster.UpdatedAtUtc = _clock.UtcNow;

            await _db.SaveChangesAsync(ct);

            return RosterRules.PositionDto(position);
        }, ct);

    /// <summary>Renames a position or changes its hours. Hours left out stay as they are. Its people's shifts to come move with the hours.</summary>
    public Task<RosterPositionSavedDto> UpdatePositionAsync(
        int rosterId, int userId, int positionId, RosterPositionSaveDto? request, CancellationToken ct)
        => WithinLimitAsync(RostersDefaults, rosterId, async () =>
        {
            Roster roster = await OwnedAsync(rosterId, userId, ct);
            RosterPosition position = await PositionAsync(rosterId, positionId, ct);

            string name = RosterRules.ReadPositionName(request?.name);

            // Read before anything changes, untracked, so the position above
            // can change under the copy this keeps.
            RosterDefaults before = await DefaultsAsync(roster, ct);

            if (request?.hours is not null) RosterRules.ApplyPositionHours(position, request.hours);

            // "бар" to "Бар" is the same position saying its name better.
            var names = await PositionNamesAsync(rosterId, ct);

            if (names.Any(known => known.Id != positionId && RosterRules.PositionKey(known.Name) == RosterRules.PositionKey(name)))
                throw new ValidationException("A position with that name is already on this roster.");

            if (name != position.Name)
            {
                // One statement rather than tracked rows: somebody removed at
                // this moment is simply not in it, where a tracked update would
                // find them gone and throw.
                await _db.RosterPeople
                    .Where(row => row.RosterId == rosterId && row.RosterPositionId == positionId)
                    .ExecuteUpdateAsync(set => set.SetProperty(row => row.Position, name), ct);
            }

            position.Name = name;
            roster.UpdatedAtUtc = _clock.UtcNow;

            await _db.SaveChangesAsync(ct);

            var after = before with
            {
                Positions = before.Positions.Select(known => known.Id == positionId ? position : known).ToArray(),
            };

            int restamped = await RestampedAsync(roster, before, after, ct);

            return new RosterPositionSavedDto(position.Id, position.Name, RosterRules.HoursDto(position), restamped);
        }, ct);

    /// <summary>The position goes and its people stay, with no position. What is left gives them their time from now on, so their shifts to come move to it.</summary>
    public Task<RosterRestampedDto> DeletePositionAsync(
        int rosterId, int userId, int positionId, CancellationToken ct)
        => WithinLimitAsync(RostersDefaults, rosterId, async () =>
        {
            // Under the lock, so a person save that has just found this position
            // cannot have it vanish from under its foreign key.
            Roster roster = await OwnedAsync(rosterId, userId, ct);
            RosterPosition position = await PositionAsync(rosterId, positionId, ct);

            RosterDefaults before = await DefaultsAsync(roster, ct);

            await _db.RosterPeople
                .Where(row => row.RosterId == rosterId && row.RosterPositionId == positionId)
                .ExecuteUpdateAsync(set => set
                    .SetProperty(row => row.RosterPositionId, (int?)null)
                    .SetProperty(row => row.Position, (string?)null), ct);

            await _db.RosterPositions.Where(row => row.Id == position.Id).ExecuteDeleteAsync(ct);

            roster.UpdatedAtUtc = _clock.UtcNow;

            await _db.SaveChangesAsync(ct);

            var after = new RosterDefaults(
                before.Venue,
                before.Positions.Where(known => known.Id != positionId).ToArray(),
                before.People
                    .Where(person => person.RosterPositionId == positionId)
                    .Select(person => Copy(person, positionId: null))
                    .ToArray());

            return new RosterRestampedDto(await RestampedAsync(roster, before, after, ct));
        }, ct);

    /// <summary>Everything that decides people's usual hours, read untracked, so a save can change the rows and still hold what they were.</summary>
    private async Task<RosterDefaults> DefaultsAsync(Roster roster, CancellationToken ct)
    {
        var positions = await _db.RosterPositions
            .AsNoTracking()
            .Where(row => row.RosterId == roster.Id)
            .OrderBy(row => row.Id)
            .ToArrayAsync(ct);

        var people = await _db.RosterPeople
            .AsNoTracking()
            .Where(row => row.RosterId == roster.Id)
            .OrderBy(row => row.Id)
            .ToArrayAsync(ct);

        return new RosterDefaults([.. roster.VenueHours ?? []], positions, people);
    }

    private async Task<(int Id, string Name)[]> PositionNamesAsync(int rosterId, CancellationToken ct)
        => (await _db.RosterPositions
                .Where(row => row.RosterId == rosterId)
                .Select(row => new { row.Id, row.Name })
                .ToArrayAsync(ct))
            .Select(row => (row.Id, row.Name))
            .ToArray();

    /// <summary>Moves what the change of usual hours asks to move, from the owner's today on, and says how many.</summary>
    private async Task<int> RestampedAsync(Roster roster, RosterDefaults before, RosterDefaults after, CancellationToken ct)
    {
        RosterRestamp[] restamps = RosterRules.Restamps(before, after);

        if (restamps.Length == 0) return 0;

        return await RestampAsync(roster.Id, await OwnersTodayAsync(roster.UserId, ct), restamps, ct);
    }

    /// <summary>One statement, compare-and-set: a shift moves only while it still holds the old hours, so a cell the owner changed a moment ago is left alone, and so is a day with no time.</summary>
    private Task<int> RestampAsync(int rosterId, DateOnly today, RosterRestamp[] restamps, CancellationToken ct)
    {
        if (restamps.Length == 0) return Task.FromResult(0);

        int[] people = restamps.Select(restamp => restamp.PersonId).ToArray();
        int[] weekdays = restamps.Select(restamp => restamp.Weekday).ToArray();
        TimeOnly[] oldStarts = restamps.Select(restamp => restamp.OldStart).ToArray();
        TimeOnly[] oldEnds = restamps.Select(restamp => restamp.OldEnd).ToArray();
        TimeOnly?[] newStarts = restamps.Select(restamp => restamp.NewStart).ToArray();
        TimeOnly?[] newEnds = restamps.Select(restamp => restamp.NewEnd).ToArray();

        return _db.Database.ExecuteSqlInterpolatedAsync(
            $"""
            UPDATE "RosterShifts" s
            SET "StartTime" = v.ns, "EndTime" = v.ne
            FROM unnest({people}::int[], {weekdays}::int[], {oldStarts}::time[], {oldEnds}::time[], {newStarts}::time[], {newEnds}::time[])
                 AS v(p, d, os, oe, ns, ne)
            WHERE s."RosterId" = {rosterId} AND s."Date" >= {today}
              AND s."RosterPersonId" = v.p AND EXTRACT(ISODOW FROM s."Date") = v.d
              AND s."StartTime" = v.os AND s."EndTime" = v.oe
            """,
            ct);
    }

    // ==== People ====

    public Task<RosterPersonDto> AddPersonAsync(
        int rosterId, int userId, RosterPersonSaveDto? request, CancellationToken ct)
        => WithinLimitAsync(RostersPeople, rosterId, async () =>
        {
            // People then defaults: an older client typing a new word makes a
            // position, and has to count positions the way POST positions does.
            await _db.Database.ExecuteSqlInterpolatedAsync($"SELECT pg_advisory_xact_lock({RostersDefaults}, {rosterId})", ct);

            Roster roster = await OwnedAsync(rosterId, userId, ct);

            var person = new RosterPerson
            {
                RosterId = rosterId,
                Name = RosterRules.CleanName(request?.name),
                Colour = RosterRules.RequireColour(request?.colour),
            };

            RosterPosition? position = await LinkAsync(rosterId, person, request, ct);

            RosterRules.ApplyPersonHours(person, request?.hours ?? new RosterHoursDto("inherit", null, null, null));
            RosterRules.ApplyPattern(person, request?.pattern ?? new RosterPatternDto("none", null, null, null, null));

            if (await _db.RosterPeople.CountAsync(row => row.RosterId == rosterId, ct) >= Roster.MaxPeople)
                throw new ValidationException($"A roster holds at most {Roster.MaxPeople} people.");

            _db.RosterPeople.Add(person);
            roster.UpdatedAtUtc = _clock.UtcNow;

            await _db.SaveChangesAsync(ct);

            return RosterRules.PersonDto(person, position is null ? [] : [position]);
        }, ct);

    /// <summary>Saves a person. Hours and usual days left out are an older client's and stay as they are; when their position or own hours change, their shifts to come at the old usual time move to the new one.</summary>
    public Task<RosterPersonSavedDto> UpdatePersonAsync(
        int rosterId, int userId, int personId, RosterPersonSaveDto? request, CancellationToken ct)
        => WithinLimitAsync(RostersDefaults, rosterId, () => RetriedAsync(async () =>
        {
            Roster roster = await OwnedAsync(rosterId, userId, ct);
            RosterPerson person = await PersonAsync(rosterId, personId, ct);

            var positions = await _db.RosterPositions
                .AsNoTracking()
                .Where(row => row.RosterId == rosterId)
                .OrderBy(row => row.Id)
                .ToArrayAsync(ct);

            var before = new RosterDefaults([.. roster.VenueHours ?? []], positions, [Copy(person)]);

            person.Name = RosterRules.CleanName(request?.name);
            person.Colour = RosterRules.RequireColour(request?.colour);

            RosterPosition? position = await LinkAsync(rosterId, person, request, ct);

            if (request?.hours is not null) RosterRules.ApplyPersonHours(person, request.hours);
            if (request?.pattern is not null) RosterRules.ApplyPattern(person, request.pattern);

            roster.UpdatedAtUtc = _clock.UtcNow;

            await _db.SaveChangesAsync(ct);

            // A position an older client's word just made has no set time, and
            // has to be there for the rule to say so.
            var after = new RosterDefaults(
                before.Venue,
                position is null || positions.Any(known => known.Id == position.Id) ? positions : [.. positions, position],
                [person]);

            int restamped = await RestampedAsync(roster, before, after, ct);

            RosterPersonDto saved = RosterRules.PersonDto(person, position is null ? [] : [position]);

            return new RosterPersonSavedDto(
                saved.id, saved.name, saved.position_id, saved.position, saved.colour, saved.hours, saved.pattern, restamped);
        }), ct);

    /// <summary>Links a person to the position the save names, and keeps the old column saying its name. A new client names it by id; an older one by a word, which finds the position ignoring case or makes one with no set time.</summary>
    private async Task<RosterPosition?> LinkAsync(
        int rosterId, RosterPerson person, RosterPersonSaveDto? request, CancellationToken ct)
    {
        RosterPosition? position;

        if (request?.hours is not null || request?.pattern is not null)
        {
            // A spread of the person as the client last read it can carry a
            // stale name, which must not move anybody.
            position = request.position_id is int id ? await PositionAsync(rosterId, id, ct) : null;
        }
        else if (RosterRules.CleanPosition(request?.position) is string word)
        {
            var known = await _db.RosterPositions.Where(row => row.RosterId == rosterId).ToArrayAsync(ct);

            position = known.FirstOrDefault(row => RosterRules.PositionKey(row.Name) == RosterRules.PositionKey(word));

            if (position is null)
            {
                if (known.Length >= Roster.MaxPositions)
                    throw new ValidationException($"A roster holds at most {Roster.MaxPositions} positions.");

                position = new RosterPosition { RosterId = rosterId, Name = word };

                // Saved now for its id. The transaction round the whole save
                // still takes it back if the rest of the person is refused.
                _db.RosterPositions.Add(position);

                await _db.SaveChangesAsync(ct);
            }
        }
        else
        {
            position = null;
        }

        person.RosterPositionId = position?.Id;
        person.Position = position?.Name;

        return position;
    }

    /// <summary>The hours that decide a person's usual time, apart from the tracked row, so what they were survives the save.</summary>
    private static RosterPerson Copy(RosterPerson person) => Copy(person, person.RosterPositionId);

    private static RosterPerson Copy(RosterPerson person, int? positionId) => new()
    {
        Id = person.Id,
        RosterId = person.RosterId,
        Name = person.Name,
        Colour = person.Colour,
        RosterPositionId = positionId,
        StartTime = person.StartTime,
        EndTime = person.EndTime,
        WeekHours = [.. person.WeekHours ?? []],
    };

    /// <summary>The person goes with their shifts, by the foreign key. A fill or a repeat writing their days at that moment waits for them to go and leaves them out, or finishes first and loses those days with them.</summary>
    public async Task DeletePersonAsync(int rosterId, int userId, int personId, CancellationToken ct)
    {
        await OwnsAsync(rosterId, userId, ct);

        int removed = await _db.RosterPeople
            .Where(row => row.Id == personId && row.RosterId == rosterId)
            .ExecuteDeleteAsync(ct);

        if (removed == 0) throw new NotFoundException("Person does not exist.");

        await TouchAsync(rosterId, ct);
    }

    // ==== Cells ====

    /// <summary>One save, so the batch lands whole or not at all.</summary>
    public Task SaveCellsAsync(int rosterId, int userId, RosterCellsDto? request, CancellationToken ct)
        => RetriedAsync(async () =>
        {
            await OwnsAsync(rosterId, userId, ct);

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

            // In key order, the order fill and repeat write in, so a batch and
            // one of those taking the same cells never wait on each other in a ring.
            foreach (RosterCell cell in cells.OrderBy(cell => cell.PersonId).ThenBy(cell => cell.Date))
            {
                existing.TryGetValue((cell.PersonId, cell.Date), out RosterShift? shift);

                if (!cell.Filled)
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
                        StartTime = cell.Start,
                        EndTime = cell.End,
                    });

                    continue;
                }

                shift.StartTime = cell.Start;
                shift.EndTime = cell.End;
            }

            int saved = await _db.SaveChangesAsync(ct);

            await TouchAsync(rosterId, ct);

            return saved;
        });

    /// <summary>Fills a month from the one before it, a day with no set time as one too. Only an empty cell takes a shift; added and kept together are what the month ends up holding. Under the defaults lock with fill, so the two never write one month at once.</summary>
    public Task<RosterRepeatedDto> RepeatAsync(
        int rosterId, int userId, RosterRepeatDto? request, CancellationToken ct)
        => WithinLimitAsync(RostersDefaults, rosterId, async () =>
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

            var add = new List<RosterShift>();

            for (DateOnly date = first; date <= last; date = date.AddDays(1))
            {
                foreach (RosterShift shift in source[RosterRules.SourceOf(date)])
                {
                    if (filled.Contains((shift.RosterPersonId, date))) continue;

                    add.Add(new RosterShift
                    {
                        RosterId = rosterId,
                        RosterPersonId = shift.RosterPersonId,
                        Date = date,
                        StartTime = shift.StartTime,
                        EndTime = shift.EndTime,
                    });
                }
            }

            int added = await FilledAsync(rosterId, [.. add], ct);

            if (added > 0)
            {
                roster.UpdatedAtUtc = _clock.UtcNow;

                await _db.SaveChangesAsync(ct);
            }

            // As in fill: a cell saved since the read above already holds its
            // day, which is a day kept.
            return new RosterRepeatedDto(added, filled.Count + add.Count - added);
        }, ct);

    /// <summary>Puts everybody on their usual days at their usual time, from the owner's today in the month being lived through. Only empty cells on open days take a shift, so a second press adds nothing.</summary>
    public Task<RosterFilledDto> FillAsync(int rosterId, int userId, RosterFillDto? request, CancellationToken ct)
        => WithinLimitAsync(RostersDefaults, rosterId, async () =>
        {
            Roster roster = await OwnedAsync(rosterId, userId, ct);

            DateOnly first = RosterRules.RequireMonth(request?.month);
            DateOnly last = RosterRules.LastDay(first);
            DateOnly today = await OwnersTodayAsync(userId, ct);
            DateOnly from = RosterRules.FillsFrom(first, today);

            if (from > last) throw new ValidationException("That month is over.");

            RosterDefaults defaults = await DefaultsAsync(roster, ct);

            var filled = (await _db.RosterShifts
                    .AsNoTracking()
                    .Where(row => row.RosterId == rosterId && row.Date >= from && row.Date <= last)
                    .Select(row => new { row.RosterPersonId, row.Date })
                    .ToArrayAsync(ct))
                .Select(row => (row.RosterPersonId, row.Date))
                .ToHashSet();

            RosterFillPlan plan = RosterRules.PlanFill(
                defaults.People, defaults.Positions, defaults.Venue, first, today, filled);

            int added = await FilledAsync(rosterId, plan.Add, ct);

            if (added > 0)
            {
                roster.UpdatedAtUtc = _clock.UtcNow;

                await _db.SaveChangesAsync(ct);
            }

            // A cell saved since the read above already holds its day, which
            // is a day kept, the same as one that was filled before.
            return new RosterFilledDto(
                added, plan.Kept + plan.Add.Length - added, plan.Skipped, from.ToString("yyyy-MM-dd"));
        }, ct);

    /// <summary>A fill's or a repeat's rows in one statement, each only where its cell is still empty and its person still on the roster. Cell saves take no lock, so any number of them can land between the read and the write; a retry would only meet the next one, so a clash is skipped rather than failed, and the rows go in the key's order, as a cell save's do, so the two never wait on each other in a ring. Nor does removing a person: the join holds each person it finds, so a removal under way is waited for and its person left out, where the foreign key would have refused the whole statement.</summary>
    private Task<int> FilledAsync(int rosterId, RosterShift[] add, CancellationToken ct)
    {
        if (add.Length == 0) return Task.FromResult(0);

        int[] people = add.Select(shift => shift.RosterPersonId).ToArray();
        DateOnly[] dates = add.Select(shift => shift.Date).ToArray();
        TimeOnly?[] starts = add.Select(shift => shift.StartTime).ToArray();
        TimeOnly?[] ends = add.Select(shift => shift.EndTime).ToArray();

        return _db.Database.ExecuteSqlInterpolatedAsync(
            $"""
            INSERT INTO "RosterShifts" ("RosterId", "RosterPersonId", "Date", "StartTime", "EndTime")
            SELECT {rosterId}, v.p, v.d, v.s, v.e
            FROM unnest({people}::int[], {dates}::date[], {starts}::time[], {ends}::time[]) AS v(p, d, s, e)
            JOIN "RosterPeople" p ON p."Id" = v.p AND p."RosterId" = {rosterId}
            ORDER BY v.p, v.d
            FOR KEY SHARE OF p
            ON CONFLICT ("RosterPersonId", "Date") DO NOTHING
            """,
            ct);
    }

    /// <summary>Takes everything off a month from the owner's today on, timed or not. The days before stay: they are what happened. No lock: a cell saved at the same moment lands before this and goes, or after and stays.</summary>
    public async Task<RosterClearedDto> ClearAsync(int rosterId, int userId, RosterFillDto? request, CancellationToken ct)
    {
        await OwnsAsync(rosterId, userId, ct);

        DateOnly first = RosterRules.RequireMonth(request?.month);
        DateOnly last = RosterRules.LastDay(first);
        DateOnly from = RosterRules.FillsFrom(first, await OwnersTodayAsync(userId, ct));

        if (from > last) throw new ValidationException("That month is over.");

        int cleared = await _db.RosterShifts
            .Where(row => row.RosterId == rosterId && row.Date >= from && row.Date <= last)
            .ExecuteDeleteAsync(ct);

        if (cleared > 0) await TouchAsync(rosterId, ct);

        return new RosterClearedDto(cleared, from.ToString("yyyy-MM-dd"));
    }

    // ==== The link ====

    /// <summary>Turns the link on. A slug already out there is replaced, which is what kills it.</summary>
    public Task<RosterShareDto> ShareAsync(int rosterId, int userId, CancellationToken ct)
        => RetriedAsync(async () =>
        {
            await OwnsAsync(rosterId, userId, ct);

            string slug = GigListing.NewSlug();

            await TouchAsync(rosterId, ct, set => set.SetProperty(row => row.ShareSlug, slug));

            return new RosterShareDto(slug);
        });

    public async Task UnshareAsync(int rosterId, int userId, CancellationToken ct)
    {
        await OwnsAsync(rosterId, userId, ct);

        await TouchAsync(rosterId, ct, set => set.SetProperty(row => row.ShareSlug, (string?)null));
    }

    /// <summary>What a link shows for a month, the current one where none was named, or null where the slug opens nothing. Six reads, however many people are on it.</summary>
    public async Task<RosterPageRead?> PageAsync(string slug, string? shown, CancellationToken ct)
    {
        var roster = await _db.Rosters
            .AsNoTracking()
            .Where(row => row.ShareSlug == slug)
            .Select(row => new { row.Id, row.UserId, row.Title, row.VenueHours })
            .FirstOrDefaultAsync(ct);

        if (roster is null) return null;

        // The page has no script to ask the reader's clock, and the crew works
        // where the owner does, so today is the owner's date and not the server's.
        DateOnly today = await OwnersTodayAsync(roster.UserId, ct);

        DateOnly month = RosterRules.TryMonth(shown) ?? new DateOnly(today.Year, today.Month, 1);
        DateOnly last = RosterRules.LastDay(month);

        // In position order already: position ids are the order positions were
        // made in, and the foreign key leaves no stale one behind. The name
        // comes along through the link, so the positions cost no read of their own.
        var people = await _db.RosterPeople
            .AsNoTracking()
            .Where(row => row.RosterId == roster.Id)
            .OrderBy(row => row.RosterPositionId == null)
            .ThenBy(row => row.RosterPositionId)
            .ThenBy(row => row.Id)
            .Select(row => new
            {
                row.Id,
                row.Name,
                row.Colour,
                row.RosterPositionId,
                Position = row.RosterPosition != null ? row.RosterPosition.Name : null,
            })
            .ToArrayAsync(ct);

        var shifts = await _db.RosterShifts
            .AsNoTracking()
            .Where(row => row.RosterId == roster.Id && row.Date >= month && row.Date <= last)
            .Select(row => new { row.RosterPersonId, row.Date, row.StartTime, row.EndTime })
            .ToArrayAsync(ct);

        var byPerson = shifts.ToLookup(row => row.RosterPersonId);

        var positions = people
            .Where(person => person.RosterPositionId is not null && person.Position is not null)
            .DistinctBy(person => person.RosterPositionId)
            .Select(person => new RosterPosition { Id = person.RosterPositionId!.Value, Name = person.Position! })
            .ToArray();

        var groups = RosterRules.Grouped(
            people.Select(person => new RosterPerson
            {
                Id = person.Id,
                Name = person.Name,
                Colour = person.Colour,
                RosterPositionId = person.RosterPositionId,
            }),
            positions);

        return new RosterPageRead(
            roster.Title,
            month,
            today,
            [.. roster.VenueHours ?? []],
            groups
                .Select(group => new RosterPageGroup(
                    group.Position?.Name,
                    group.People
                        .Select(person => new RosterPagePerson(
                            person.Name,
                            person.Colour,
                            byPerson[person.Id]
                                .Select(row => new RosterPageShift(row.Date, row.StartTime, row.EndTime))
                                .ToArray()))
                        .ToArray()))
                .ToArray());
    }

    private static RosterDto ToDto(Roster roster)
    {
        RosterPosition[] positions = (roster.Positions ?? []).OrderBy(position => position.Id).ToArray();

        return new RosterDto(
            roster.Id,
            roster.Title,
            roster.ShareSlug,
            RosterRules.WeekDto(roster.VenueHours),
            positions.Select(RosterRules.PositionDto).ToArray(),
            (roster.People ?? []).OrderBy(person => person.Id).Select(person => RosterRules.PersonDto(person, positions)).ToArray());
    }
}
