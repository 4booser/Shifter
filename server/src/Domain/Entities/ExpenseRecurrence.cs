namespace Shifter.Domain.Entities;

/// <summary>
/// Turns a standing cost into the days it actually falls on.
///
/// Pure, so the list, the month's totals and the tests all ask the same
/// function and cannot disagree about what "every month on the 5th" means.
/// </summary>
public static class ExpenseRecurrence
{
    public static IEnumerable<DateOnly> Occurrences(ExpenseRule rule, DateOnly from, DateOnly to)
    {
        if (to < from) yield break;

        var skipped = ParseDays(rule.SkippedDays);

        var first = rule.StartsOn > from ? rule.StartsOn : from;
        var last = rule.EndsOn is DateOnly ends && ends < to ? ends : to;

        if (last < first) yield break;

        if (rule.Period == "week")
        {
            for (var date = first; date <= last; date = date.AddDays(1))
            {
                // Monday-first, the shape the rest of the calendar speaks.
                if (((int)date.DayOfWeek + 6) % 7 != rule.Weekday) continue;
                if (skipped.Contains(date)) continue;

                yield return date;
            }

            yield break;
        }

        var day = Math.Clamp(rule.DayOfMonth, 1, 28);

        for (var month = new DateOnly(first.Year, first.Month, 1);
             month <= last;
             month = month.AddMonths(1))
        {
            var on = new DateOnly(month.Year, month.Month, day);

            if (on < first || on > last) continue;
            if (skipped.Contains(on)) continue;

            yield return on;
        }
    }

    public static HashSet<DateOnly> ParseDays(string joined)
    {
        var days = new HashSet<DateOnly>();

        foreach (var part in joined.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries))
            if (DateOnly.TryParse(part, out var day)) days.Add(day);

        return days;
    }

    public static string JoinDays(IEnumerable<DateOnly> days)
        => string.Join(',', days.Distinct().OrderBy(day => day).Select(day => day.ToString("yyyy-MM-dd")));
}
