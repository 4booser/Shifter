using System.Globalization;

using Shifter.Application.Common.Exceptions;
using Shifter.Application.Features.business.DTOs;
using Shifter.Domain.Entities;

namespace Shifter.Application.Features.Rosters;

/// <summary>What a roster accepts, how one month is laid over the next, and whose usual time is what.</summary>
/// <remarks>The server and both clients carry this same rule, held to one set of cases in shared/roster/roster-rules.cases.json: a change here is a change in both copies.</remarks>
public static class RosterRules
{
    /// <summary>The most entries one save may carry, set and clear together.</summary>
    public const int BatchMax = 500;

    /// <summary>Drawn when a stored colour fails the check on its way out.</summary>
    public const string NeutralColour = "#8c8578";

    /// <summary>The first month a roster can hold. Bounded so a month always has neighbours: stepping past either end of the calendar throws.</summary>
    public static readonly DateOnly FirstMonth = new(2000, 1, 1);

    /// <summary>The last, for the same reason.</summary>
    public static readonly DateOnly LastMonth = new(2100, 12, 1);

    private static readonly string[] NamesRu = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];
    private static readonly string[] NamesUk = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Нд"];

    public static string CleanTitle(string? value)
        => Required(value, Roster.TitleMax, "Title");

    public static string CleanName(string? value)
        => Required(value, RosterPerson.NameMax, "Name");

    /// <summary>An older client's word for a position, or null where it typed none.</summary>
    public static string? CleanPosition(string? value)
        => Plain(value, "Position").Length == 0 ? null : ReadPositionName(value);

    /// <summary>A position's name: trimmed, said, and short enough for a cell.</summary>
    public static string ReadPositionName(string? value)
        => Required(value, RosterPosition.NameMax, "Position");

    /// <summary>The key two names are one position under: "бар " and "Бар" are the same job.</summary>
    public static string PositionKey(string name) => name.Trim().ToLowerInvariant();

    /// <summary>Upper-case hex is the same colour, so it is folded rather than refused.</summary>
    public static string RequireColour(string? value)
    {
        string colour = (value ?? string.Empty).Trim().ToLowerInvariant();

        if (!IsColour(colour)) throw new ValidationException("Colour must be a hex value like #6366f1.");

        return colour;
    }

    /// <summary>Exactly #rrggbb in lower case. By hand rather than a regular expression, whose $ lets a trailing newline through.</summary>
    public static bool IsColour(string? value)
        => value is { Length: 7 }
            && value[0] == '#'
            && value[1..].All(char.IsAsciiHexDigitLower);

    /// <summary>The first of the month a yyyy-MM names, or null when it names nothing a roster can show.</summary>
    public static DateOnly? TryMonth(string? value)
    {
        bool read = DateOnly.TryParseExact(
            $"{value}-01", "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out var month);

        return read && month >= FirstMonth && month <= LastMonth ? month : null;
    }

    public static DateOnly RequireMonth(string? value)
        => TryMonth(value) ?? throw new ValidationException("month must be yyyy-MM.");

    public static DateOnly LastDay(DateOnly month) => month.AddMonths(1).AddDays(-1);

    /// <summary>Where a fill or a clear of a month starts: its first day, or the owner's today in the month being lived through. Past the month's last day is a month already over.</summary>
    public static DateOnly FillsFrom(DateOnly month, DateOnly today) => today > month ? today : month;

    /// <summary>The nth weekday of the month before, or the last one where that month has no nth.</summary>
    public static DateOnly SourceOf(DateOnly target)
    {
        DateOnly month = new DateOnly(target.Year, target.Month, 1).AddMonths(-1);

        int toWeekday = ((int)target.DayOfWeek - (int)month.DayOfWeek + 7) % 7;
        int earlier = (target.Day - 1) / 7;

        DateOnly source = month.AddDays(toWeekday + earlier * 7);

        return source.Month == month.Month ? source : source.AddDays(-7);
    }

    /// <summary>The hours as a crew writes them: 11-22, 11:30-22. Midnight closes a shift as 24, since 18-0 reads as nothing.</summary>
    public static string Compact(TimeOnly start, TimeOnly end)
        => $"{Clock(start)}-{(end == TimeOnly.MinValue ? "24" : Clock(end))}";

    /// <summary>The whole batch read and refused as one, before anything is written.</summary>
    public static RosterCell[] ReadBatch(RosterCellsDto? request)
    {
        if (request is null) throw new ValidationException("The request has no body.");

        RosterCellSetDto?[] set = request.set ?? [];
        RosterCellClearDto?[] clear = request.clear ?? [];

        if (set.Length + clear.Length > BatchMax)
            throw new ValidationException($"A save holds at most {BatchMax} cells.");

        var cells = new Dictionary<(int, DateOnly), RosterCell>();

        foreach (RosterCellSetDto? entry in set)
        {
            if (entry is null) throw new ValidationException("A cell is empty.");

            DateOnly date = RequireDate(entry.date);

            // Neither time is a day worked at no set time; one without the
            // other is half a pair, which nothing can draw or store.
            if (entry.start_time is null && entry.end_time is null)
            {
                cells[(entry.person_id, date)] = new RosterCell(entry.person_id, date, true, null, null);

                continue;
            }

            if (entry.start_time is null || entry.end_time is null)
                throw new ValidationException("start_time and end_time come together.");

            (TimeOnly start, TimeOnly end) = RequireHours(entry.start_time, entry.end_time);

            cells[(entry.person_id, date)] = new RosterCell(entry.person_id, date, true, start, end);
        }

        foreach (RosterCellClearDto? entry in clear)
        {
            if (entry is null) throw new ValidationException("A cell is empty.");

            DateOnly date = RequireDate(entry.date);

            cells[(entry.person_id, date)] = new RosterCell(entry.person_id, date, false, null, null);
        }

        return cells.Values.ToArray();
    }

    // ==== Hours, positions and usual days as a save sends them ====

    /// <summary>Open weekdays, or a weekday's own hours: each weekday once, in weekday order. Null is none.</summary>
    public static List<WeekdayHours> ReadWeek(WeekHoursDto?[]? entries)
    {
        List<WeekdayHours> week = [];

        foreach (WeekHoursDto? entry in entries ?? [])
        {
            if (entry is null) throw new ValidationException("An entry of the hours is empty.");

            if (entry.weekday is < 1 or > 7)
                throw new ValidationException("weekday must be from 1 to 7.");

            if (week.Any(known => known.Weekday == entry.weekday))
                throw new ValidationException("A weekday is listed more than once.");

            (TimeOnly start, TimeOnly end) = RequirePair(entry.start_time, entry.end_time);

            week.Add(new WeekdayHours { Weekday = entry.weekday, StartTime = start, EndTime = end });
        }

        return week.OrderBy(entry => entry.Weekday).ToList();
    }

    /// <summary>Checked whole before the position changes, so a refusal leaves it as it was. None and venue keep no hours of their own.</summary>
    public static void ApplyPositionHours(RosterPosition position, RosterHoursDto hours)
    {
        RosterHoursMode mode = hours.mode switch
        {
            "none" => RosterHoursMode.None,
            "own" => RosterHoursMode.Own,
            "venue" => RosterHoursMode.Venue,
            _ => throw new ValidationException("hours.mode must be none, own or venue."),
        };

        (TimeOnly? start, TimeOnly? end, List<WeekdayHours> week) = mode == RosterHoursMode.Own
            ? Own(hours)
            : (null, null, []);

        position.HoursMode = mode;
        position.StartTime = start;
        position.EndTime = end;
        position.WeekHours = week;
    }

    /// <summary>Inherit is no hours of their own, so their position's or the venue's apply.</summary>
    public static void ApplyPersonHours(RosterPerson person, RosterHoursDto hours)
    {
        (TimeOnly? start, TimeOnly? end, List<WeekdayHours> week) = hours.mode switch
        {
            "inherit" => (null, null, []),
            "own" => Own(hours),
            _ => throw new ValidationException("hours.mode must be inherit or own."),
        };

        person.StartTime = start;
        person.EndTime = end;
        person.WeekHours = week;
    }

    /// <summary>Stored so the table's check holds by construction: weekdays or a cycle, never both, and a cycle whole.</summary>
    public static void ApplyPattern(RosterPerson person, RosterPatternDto pattern)
    {
        (int[]? weekdays, int? on, int? off, DateOnly? from) = pattern.kind switch
        {
            "none" => (null, null, null, null),
            "weekdays" => (Weekdays(pattern.weekdays), null, null, null),
            "cycle" => Cycle(pattern),
            _ => throw new ValidationException("pattern.kind must be none, weekdays or cycle."),
        };

        person.PatternWeekdays = weekdays;
        person.CycleOn = on;
        person.CycleOff = off;
        person.CycleFrom = from;
    }

    private static (TimeOnly?, TimeOnly?, List<WeekdayHours>) Own(RosterHoursDto hours)
    {
        (TimeOnly start, TimeOnly end) = RequirePair(hours.start_time, hours.end_time);

        return (start, end, ReadWeek(hours.week_hours));
    }

    private static int[] Weekdays(int[]? weekdays)
    {
        if (weekdays is null || weekdays.Length == 0)
            throw new ValidationException("Usual days need at least one weekday.");

        if (weekdays.Any(weekday => weekday is < 1 or > 7))
            throw new ValidationException("weekday must be from 1 to 7.");

        if (weekdays.Distinct().Count() != weekdays.Length)
            throw new ValidationException("A weekday is listed more than once.");

        return weekdays.Order().ToArray();
    }

    private static (int[]?, int?, int?, DateOnly?) Cycle(RosterPatternDto pattern)
    {
        if (pattern.on is not (>= 1 and <= RosterPerson.CycleMax) || pattern.off is not (>= 1 and <= RosterPerson.CycleMax))
            throw new ValidationException($"A cycle runs 1 to {RosterPerson.CycleMax} days on and 1 to {RosterPerson.CycleMax} days off.");

        bool read = DateOnly.TryParseExact(
            pattern.from, "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out var from);

        if (!read) throw new ValidationException("from must be yyyy-MM-dd.");

        if (from < FirstMonth || from > LastDay(LastMonth))
            throw new ValidationException("That date is outside what a roster can hold.");

        return (null, pattern.on, pattern.off, from);
    }

    // ==== Whose usual time is what ====

    /// <summary>ISO: Monday is 1, Sunday is 7.</summary>
    public static int Weekday(DateOnly date) => date.DayOfWeek == DayOfWeek.Sunday ? 7 : (int)date.DayOfWeek;

    /// <summary>That weekday's own hours where the list has them, otherwise the usual pair.</summary>
    public static (TimeOnly Start, TimeOnly End) HoursOnWeek(
        TimeOnly start, TimeOnly end, IEnumerable<WeekdayHours>? week, int weekday)
        => (week ?? []).FirstOrDefault(entry => entry.Weekday == weekday) is WeekdayHours own
            ? (own.StartTime, own.EndTime)
            : (start, end);

    /// <summary>Somebody's usual hours on a date, or null for no set time.</summary>
    public static (TimeOnly Start, TimeOnly End)? DefaultHours(
        RosterPerson person,
        IReadOnlyCollection<RosterPosition> positions,
        IReadOnlyCollection<WeekdayHours> venue,
        DateOnly date)
        => DefaultOnWeekday(person, positions, venue, Weekday(date));

    /// <summary>Their own hours, else their position's, else the venue's, and a position with no set time stops there. Only the weekday matters, which is what lets a restamp go by weekday.</summary>
    public static (TimeOnly Start, TimeOnly End)? DefaultOnWeekday(
        RosterPerson person,
        IReadOnlyCollection<RosterPosition> positions,
        IReadOnlyCollection<WeekdayHours> venue,
        int weekday)
    {
        // Their own hours win over everything, a day the venue is closed too.
        if (person.StartTime is TimeOnly start && person.EndTime is TimeOnly end)
            return HoursOnWeek(start, end, person.WeekHours, weekday);

        // A position since deleted is no position.
        RosterPosition? position = person.RosterPositionId is int id
            ? positions.FirstOrDefault(known => known.Id == id)
            : null;

        switch (position)
        {
            case { HoursMode: RosterHoursMode.Own, StartTime: TimeOnly from, EndTime: TimeOnly to }:
                return HoursOnWeek(from, to, position.WeekHours, weekday);
            case { HoursMode: RosterHoursMode.None }:
                return null;
        }

        return VenueOn(venue, weekday);
    }

    /// <summary>The venue's hours on a weekday, or null where it is closed or never said.</summary>
    public static (TimeOnly Start, TimeOnly End)? VenueOn(IReadOnlyCollection<WeekdayHours> venue, int weekday)
        => venue.FirstOrDefault(entry => entry.Weekday == weekday) is WeekdayHours open
            ? (open.StartTime, open.EndTime)
            : null;

    /// <summary>A venue that never said its hours is closed on no day.</summary>
    public static bool OpenOn(IReadOnlyCollection<WeekdayHours> venue, DateOnly date)
        => venue.Count == 0 || venue.Any(entry => entry.Weekday == Weekday(date));

    /// <summary>Whether a date is one of somebody's usual days. A cycle counts calendar days from its first day, before it as well as after.</summary>
    public static bool WorksOn(RosterPerson person, DateOnly date)
    {
        if (person.PatternWeekdays is int[] weekdays) return weekdays.Contains(Weekday(date));

        if (person is { CycleOn: int on, CycleOff: int off, CycleFrom: DateOnly from })
        {
            int length = on + off;
            int days = date.DayNumber - from.DayNumber;

            return ((days % length) + length) % length < on;
        }

        return false;
    }

    /// <summary>The venue's week in one line, neighbouring days with the same hours run together: «Пн–Чт 12:00–00:00 · Пт–Сб 12:00–02:00 · Вс закрыто». Null where the venue never said.</summary>
    public static string? VenueLine(IReadOnlyCollection<WeekdayHours> venue, bool uk)
        => venue.Count == 0 ? null : string.Join(" · ", VenueRuns(venue, uk));

    /// <summary>The same line cut at its dots, a run of days to an entry: «Пн–Чт 12:00–00:00», «Вс закрыто». Empty where the venue never said. A page keeps each one whole, so a narrow screen breaks the line between runs and never after one of their dashes.</summary>
    public static string[] VenueRuns(IReadOnlyCollection<WeekdayHours> venue, bool uk)
    {
        if (venue.Count == 0) return [];

        string[] names = uk ? NamesUk : NamesRu;

        string Say(int weekday) => venue.FirstOrDefault(entry => entry.Weekday == weekday) is WeekdayHours open
            ? $"{Time(open.StartTime)}–{Time(open.EndTime)}"
            : uk ? "зачинено" : "закрыто";

        var groups = new List<(int From, int To, string Say)>();

        for (int weekday = 1; weekday <= 7; weekday++)
        {
            string say = Say(weekday);

            if (groups.Count > 0 && groups[^1].Say == say)
                groups[^1] = groups[^1] with { To = weekday };
            else
                groups.Add((weekday, weekday, say));
        }

        return groups
            .Select(group =>
                (group.From == group.To ? names[group.From - 1] : $"{names[group.From - 1]}–{names[group.To - 1]}")
                + " " + group.Say)
            .ToArray();
    }

    /// <summary>The order people are listed in everywhere: by their position, positions in the order they were made, then those with none; each group by person.</summary>
    public static RosterPerson[] ByPosition(IEnumerable<RosterPerson> people, IReadOnlyCollection<RosterPosition> positions)
    {
        Dictionary<int, int> rank = positions
            .OrderBy(position => position.Id)
            .Select((position, index) => (position.Id, index))
            .ToDictionary(entry => entry.Id, entry => entry.index);

        return people
            .OrderBy(person => Rank(person, rank, positions.Count))
            .ThenBy(person => person.Id)
            .ToArray();
    }

    /// <summary>The same order cut where the position changes. Empty groups are left out.</summary>
    public static RosterGroup[] Grouped(IEnumerable<RosterPerson> people, IReadOnlyCollection<RosterPosition> positions)
    {
        Dictionary<int, RosterPosition> byId = positions.ToDictionary(position => position.Id);

        return ByPosition(people, positions)
            .GroupBy(person => person.RosterPositionId is int id && byId.ContainsKey(id) ? id : (int?)null)
            .Select(group => new RosterGroup(group.Key is int id ? byId[id] : null, group.ToArray()))
            .ToArray();
    }

    private static int Rank(RosterPerson person, Dictionary<int, int> rank, int none)
        => person.RosterPositionId is int id && rank.TryGetValue(id, out int at) ? at : none;

    // ==== Restamp and fill ====

    /// <summary>For each person in both and each weekday whose usual hours were a time and are now something else: the old hours and the new.</summary>
    public static RosterRestamp[] Restamps(RosterDefaults before, RosterDefaults after)
    {
        Dictionary<int, RosterPerson> was = before.People.ToDictionary(person => person.Id);
        List<RosterRestamp> restamps = [];

        foreach (RosterPerson person in after.People)
        {
            if (!was.TryGetValue(person.Id, out RosterPerson? then)) continue;

            for (int weekday = 1; weekday <= 7; weekday++)
            {
                if (DefaultOnWeekday(then, before.Positions, before.Venue, weekday) is not { } old) continue;

                var now = DefaultOnWeekday(person, after.Positions, after.Venue, weekday);

                if (now == old) continue;

                restamps.Add(new RosterRestamp(person.Id, weekday, old.Start, old.End, now?.Start, now?.End));
            }
        }

        return restamps.ToArray();
    }

    /// <summary>The hours a shift moves to, or null where it stays: a day with no time, a day gone by and a day set by hand all stay. The service does the same in one statement.</summary>
    public static (TimeOnly? Start, TimeOnly? End)? RestampOf(RosterShift shift, RosterRestamp[] restamps, DateOnly today)
    {
        if (shift.StartTime is not TimeOnly start || shift.EndTime is not TimeOnly end || shift.Date < today)
            return null;

        int weekday = Weekday(shift.Date);

        foreach (RosterRestamp restamp in restamps)
        {
            if (restamp.PersonId == shift.RosterPersonId
                && restamp.Weekday == weekday
                && restamp.OldStart == start
                && restamp.OldEnd == end)
                return (restamp.NewStart, restamp.NewEnd);
        }

        return null;
    }

    /// <summary>Every usual day from the fill's first day to the month's last, at the usual time, where the cell is empty and the venue open. A filled cell is kept even on a closed day; an empty one there is skipped, own hours or not, because a closed day is filled by hand if at all.</summary>
    public static RosterFillPlan PlanFill(
        IReadOnlyList<RosterPerson> people,
        IReadOnlyCollection<RosterPosition> positions,
        IReadOnlyCollection<WeekdayHours> venue,
        DateOnly month,
        DateOnly today,
        IReadOnlySet<(int PersonId, DateOnly Date)> filled)
    {
        DateOnly from = FillsFrom(month, today);
        DateOnly last = LastDay(month);

        if (from > last) return new RosterFillPlan([], 0, 0);

        List<RosterShift> add = [];
        int kept = 0;
        int skipped = 0;

        foreach (RosterPerson person in people.OrderBy(person => person.Id))
        {
            for (DateOnly date = from; date <= last; date = date.AddDays(1))
            {
                if (!WorksOn(person, date)) continue;

                if (filled.Contains((person.Id, date)))
                {
                    kept++;

                    continue;
                }

                if (!OpenOn(venue, date))
                {
                    skipped++;

                    continue;
                }

                var hours = DefaultHours(person, positions, venue, date);

                add.Add(new RosterShift
                {
                    RosterPersonId = person.Id,
                    Date = date,
                    StartTime = hours?.Start,
                    EndTime = hours?.End,
                });
            }
        }

        return new RosterFillPlan(
            add.OrderBy(shift => shift.Date).ThenBy(shift => shift.RosterPersonId).ToArray(),
            kept,
            skipped);
    }

    // ==== On the way out ====

    public static WeekHoursDto[] WeekDto(IEnumerable<WeekdayHours>? week)
        => (week ?? [])
            .OrderBy(entry => entry.Weekday)
            .Select(entry => new WeekHoursDto(entry.Weekday, Time(entry.StartTime), Time(entry.EndTime)))
            .ToArray();

    public static RosterPositionDto PositionDto(RosterPosition position)
        => new(position.Id, position.Name, HoursDto(position));

    public static RosterHoursDto HoursDto(RosterPosition position)
        => position is { HoursMode: RosterHoursMode.Own, StartTime: TimeOnly start, EndTime: TimeOnly end }
            ? new RosterHoursDto("own", Time(start), Time(end), WeekDto(position.WeekHours))
            : new RosterHoursDto(position.HoursMode == RosterHoursMode.Venue ? "venue" : "none", null, null, []);

    public static RosterHoursDto HoursDto(RosterPerson person)
        => person is { StartTime: TimeOnly start, EndTime: TimeOnly end }
            ? new RosterHoursDto("own", Time(start), Time(end), WeekDto(person.WeekHours))
            : new RosterHoursDto("inherit", null, null, []);

    public static RosterPatternDto PatternDto(RosterPerson person)
    {
        if (person.PatternWeekdays is int[] weekdays)
            return new RosterPatternDto("weekdays", weekdays.Order().ToArray(), null, null, null);

        if (person is { CycleOn: int on, CycleOff: int off, CycleFrom: DateOnly from })
            return new RosterPatternDto("cycle", [], on, off, from.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture));

        return new RosterPatternDto("none", [], null, null, null);
    }

    /// <summary>The position is named from the link, never from the old free-text column.</summary>
    public static RosterPersonDto PersonDto(RosterPerson person, IReadOnlyCollection<RosterPosition> positions)
        => new(
            person.Id,
            person.Name,
            person.RosterPositionId,
            positions.FirstOrDefault(position => position.Id == person.RosterPositionId)?.Name,
            person.Colour,
            HoursDto(person),
            PatternDto(person));

    public static RosterShiftDto ShiftDto(RosterShift shift)
        => new(
            shift.RosterPersonId,
            shift.Date.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture),
            shift.StartTime is TimeOnly start ? Time(start) : null,
            shift.EndTime is TimeOnly end ? Time(end) : null);

    public static string Time(TimeOnly time) => time.ToString("HH:mm", CultureInfo.InvariantCulture);

    private static DateOnly RequireDate(string? value)
    {
        bool read = DateOnly.TryParseExact(
            value, "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out var date);

        if (!read) throw new ValidationException("date must be yyyy-MM-dd.");

        if (date < FirstMonth || date > LastDay(LastMonth))
            throw new ValidationException("That date is outside what a roster can hold.");

        return date;
    }

    private static (TimeOnly Start, TimeOnly End) RequireHours(string? start, string? end)
    {
        (TimeOnly from, TimeOnly to) = (RequireTime(start, "start_time"), RequireTime(end, "end_time"));

        if (from == to) throw new ValidationException("A shift cannot start and end at the same minute.");

        return (from, to);
    }

    /// <summary>Usual hours rather than a shift's, which say so in their own words.</summary>
    private static (TimeOnly Start, TimeOnly End) RequirePair(string? start, string? end)
    {
        (TimeOnly from, TimeOnly to) = (RequireTime(start, "start_time"), RequireTime(end, "end_time"));

        if (from == to) throw new ValidationException("Start and end time must differ.");

        return (from, to);
    }

    private static TimeOnly RequireTime(string? value, string field)
        => TimeOnly.TryParseExact(value, "HH:mm", CultureInfo.InvariantCulture, DateTimeStyles.None, out var time)
            ? time
            : throw new ValidationException($"{field} must be HH:mm.");

    private static string Clock(TimeOnly time)
        => time.Minute == 0
            ? time.Hour.ToString(CultureInfo.InvariantCulture)
            : time.ToString("H:mm", CultureInfo.InvariantCulture);

    private static string Required(string? value, int max, string what)
    {
        string cleaned = Plain(value, what);

        if (cleaned.Length == 0) throw new ValidationException($"{what} is required.");
        if (cleaned.Length > max) throw new ValidationException($"{what} must be at most {max} characters.");

        return cleaned;
    }

    /// <summary>Trimmed. A control character is refused here because a NUL would otherwise reach Postgres and come back a 500.</summary>
    private static string Plain(string? value, string what)
    {
        string cleaned = value?.Trim() ?? string.Empty;

        if (cleaned.Any(char.IsControl))
            throw new ValidationException($"{what} holds a character that cannot be shown.");

        return cleaned;
    }
}
