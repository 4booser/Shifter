namespace Shifter.Domain.Entities;

/// <summary>
/// Runs of closed weekly goals, counted and nothing else — the same tone as
/// WorkStreaks: «третья неделя подряд» is a constatation, never advice.
/// </summary>
public static class GoalStreaks
{
    /// <summary>
    /// The current run of consecutive closed weeks, counted back from the
    /// week containing <paramref name="today"/>. The current week counts
    /// when closed; an open current week does not break the run — the streak
    /// is alive until a whole week passes unclosed.
    /// </summary>
    public static int Weekly(IEnumerable<DateOnly> closedWeekStarts, DateOnly today)
    {
        var closed = closedWeekStarts.ToHashSet();

        // Monday of the current week, matching GoalCalculator's week anchor.
        var monday = today.AddDays(-(((int)today.DayOfWeek + 6) % 7));

        var cursor = closed.Contains(monday) ? monday : monday.AddDays(-7);
        var run = 0;

        while (closed.Contains(cursor))
        {
            run++;
            cursor = cursor.AddDays(-7);
        }

        return run;
    }
}
