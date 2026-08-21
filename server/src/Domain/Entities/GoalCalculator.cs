namespace Shifter.Domain.Entities;

/// <summary>
/// Which goal applies to a stretch of time, and what it is worth over it.
///
/// Pure, like <see cref="PayPeriodCalculator"/>, so the same answer comes out
/// on the server and in a test without a database in between.
/// </summary>
public static class GoalCalculator
{
    /// <summary>The period a date falls in, as an inclusive pair.</summary>
    public static (DateOnly From, DateOnly To) PeriodFor(GoalPeriod period, DateOnly date)
        => period switch
        {
            GoalPeriod.Day => (date, date),
            // Monday-first, matching how the rest of the app counts a week.
            GoalPeriod.Week => Week(date),
            GoalPeriod.Month => (
                new DateOnly(date.Year, date.Month, 1),
                new DateOnly(date.Year, date.Month, DateTime.DaysInMonth(date.Year, date.Month))),
            _ => (new DateOnly(date.Year, 1, 1), new DateOnly(date.Year, 12, 31)),
        };

    /// <summary>
    /// The goal that governs <paramref name="date"/>, or null when none does.
    ///
    /// A goal set for one particular period beats a standing one: "45 000 this
    /// December" is a deliberate exception to "30 000 a month", and the whole
    /// reason for writing it down is that it should win.
    /// </summary>
    public static Goal? ResolveFor(IEnumerable<Goal> goals, GoalPeriod period, DateOnly date)
    {
        var (from, to) = PeriodFor(period, date);
        Goal? standing = null;

        foreach (Goal goal in goals)
        {
            if (goal.Period != period) continue;

            if (goal.Anchor is DateOnly anchor)
            {
                // Any date inside the period names it, so a client may send the
                // first of the month or the day the user happened to be looking
                // at, and both mean the same period.
                if (anchor >= from && anchor <= to) return goal;

                continue;
            }

            standing = goal;
        }

        return standing;
    }

    /// <summary>
    /// What the goal asks for across a range that is not its own period — a
    /// daily goal read over a month is that figure times the days in it.
    ///
    /// Whole periods only. Half a month against a monthly goal is not half the
    /// target in any sense the reader would accept, so the caller is told there
    /// is no comparable figure rather than handed a prorated fiction.
    /// </summary>
    public static decimal? TargetOver(Goal goal, DateOnly from, DateOnly to)
    {
        if (from > to) return null;

        int days = to.DayNumber - from.DayNumber + 1;

        return goal.Period switch
        {
            GoalPeriod.Day => goal.Amount * days,
            GoalPeriod.Week => days % 7 == 0 ? goal.Amount * (days / 7) : null,
            GoalPeriod.Month => WholeMonths(from, to) is int months ? goal.Amount * months : null,
            _ => WholeYears(from, to) is int years ? goal.Amount * years : null,
        };
    }

    private static (DateOnly, DateOnly) Week(DateOnly date)
    {
        int offset = ((int)date.DayOfWeek + 6) % 7;
        DateOnly start = date.AddDays(-offset);

        return (start, start.AddDays(6));
    }

    /// <summary>Months spanned, or null when the range is not whole months.</summary>
    private static int? WholeMonths(DateOnly from, DateOnly to)
    {
        if (from.Day != 1) return null;
        if (to != new DateOnly(to.Year, to.Month, DateTime.DaysInMonth(to.Year, to.Month))) return null;

        return (to.Year - from.Year) * 12 + to.Month - from.Month + 1;
    }

    private static int? WholeYears(DateOnly from, DateOnly to)
    {
        if (from.Month != 1 || from.Day != 1) return null;
        if (to.Month != 12 || to.Day != 31) return null;

        return to.Year - from.Year + 1;
    }
}
