namespace Shifter.Domain.Entities;

/// <summary>
/// Turns a repeating event's rule into concrete dates inside a window.
/// Pure on purpose: the calendar, the ICS feed and the tests all ask the
/// same function, so they can never disagree about what "every Tuesday"
/// means.
/// </summary>
public static class EventRecurrence
{
    public static IEnumerable<DateOnly> Occurrences(Event item, DateOnly from, DateOnly to)
    {
        if (!item.Repeats)
        {
            if (item.StartDate <= to && item.EndDate >= from) yield return item.StartDate;

            yield break;
        }

        var weekdays = ParseWeekdays(item.RepeatWeekdays!);

        if (weekdays.Count == 0) yield break;

        var first = item.StartDate > from ? item.StartDate : from;
        var last = to;

        if (item.RepeatUntil is DateOnly until && until < last) last = until;

        for (var date = first; date <= last; date = date.AddDays(1))
        {
            // Monday-first, the shape the rest of the calendar speaks.
            var weekday = ((int)date.DayOfWeek + 6) % 7;

            if (weekdays.Contains(weekday)) yield return date;
        }
    }

    public static HashSet<int> ParseWeekdays(string mask)
    {
        var parsed = new HashSet<int>();

        foreach (var part in mask.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries))
        {
            if (int.TryParse(part, out var weekday) && weekday is >= 0 and <= 6) parsed.Add(weekday);
        }

        return parsed;
    }
}
