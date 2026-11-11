using System.Globalization;

using Shifter.Application.Common.Exceptions;
using Shifter.Domain.Entities;

namespace Shifter.Application.Features.Rosters;

/// <summary>What a roster accepts, and how one month is laid over the next.</summary>
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

    public static string CleanTitle(string? value)
        => Required(value, Roster.TitleMax, "Title");

    public static string CleanName(string? value)
        => Required(value, RosterPerson.NameMax, "Name");

    public static string? CleanPosition(string? value)
    {
        string cleaned = Plain(value, "Position");

        if (cleaned.Length == 0) return null;

        if (cleaned.Length > RosterPerson.PositionMax)
            throw new ValidationException($"Position must be at most {RosterPerson.PositionMax} characters.");

        return cleaned;
    }

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
            (TimeOnly start, TimeOnly end) = RequireHours(entry.start_time, entry.end_time);

            cells[(entry.person_id, date)] = new RosterCell(entry.person_id, date, start, end);
        }

        foreach (RosterCellClearDto? entry in clear)
        {
            if (entry is null) throw new ValidationException("A cell is empty.");

            DateOnly date = RequireDate(entry.date);

            cells[(entry.person_id, date)] = new RosterCell(entry.person_id, date, null, null);
        }

        return cells.Values.ToArray();
    }

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
        if (!TimeOnly.TryParseExact(start, "HH:mm", CultureInfo.InvariantCulture, DateTimeStyles.None, out var from))
            throw new ValidationException("start_time must be HH:mm.");

        if (!TimeOnly.TryParseExact(end, "HH:mm", CultureInfo.InvariantCulture, DateTimeStyles.None, out var to))
            throw new ValidationException("end_time must be HH:mm.");

        if (from == to) throw new ValidationException("A shift cannot start and end at the same minute.");

        return (from, to);
    }

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
