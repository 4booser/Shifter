namespace Shifter.Domain.Entities;

/// <summary>
/// Works out which pay period a date falls in. Kept as a pure function of the
/// location's settings so the same boundaries come out on the server, in a
/// summary and in an export.
/// </summary>
public static class PayPeriodCalculator
{
    public static (DateOnly From, DateOnly To) PeriodFor(Location location, DateOnly date)
        => location.PayPeriod switch
        {
            PayPeriod.Monthly => Monthly(location.PayDay, date),
            PayPeriod.SemiMonthly => SemiMonthly(date),
            PayPeriod.BiWeekly => Rolling(location.PayAnchor, date, 14),
            PayPeriod.Weekly => Rolling(location.PayAnchor, date, 7),
            _ => Monthly(1, date)
        };

    /// <summary>
    /// A payday of 1 gives plain calendar months. Any other day shifts the
    /// window: paid on the 10th means the 10th through the 9th of next month.
    /// </summary>
    private static (DateOnly, DateOnly) Monthly(int payDay, DateOnly date)
    {
        int day = Math.Clamp(payDay, 1, 28);

        DateOnly start = date.Day >= day
            ? new DateOnly(date.Year, date.Month, day)
            : new DateOnly(date.Year, date.Month, day).AddMonths(-1);

        return (start, start.AddMonths(1).AddDays(-1));
    }

    private static (DateOnly, DateOnly) SemiMonthly(DateOnly date)
    {
        if (date.Day <= 15)
            return (new DateOnly(date.Year, date.Month, 1), new DateOnly(date.Year, date.Month, 15));

        int last = DateTime.DaysInMonth(date.Year, date.Month);

        return (new DateOnly(date.Year, date.Month, 16), new DateOnly(date.Year, date.Month, last));
    }

    /// <summary>
    /// Fixed-length cycles counted from the anchor. Floor division keeps dates
    /// before the anchor on the right side of the boundary, which a plain
    /// remainder would not.
    /// </summary>
    private static (DateOnly, DateOnly) Rolling(DateOnly anchor, DateOnly date, int length)
    {
        int elapsed = date.DayNumber - anchor.DayNumber;
        int index = (int)Math.Floor(elapsed / (double)length);

        DateOnly start = anchor.AddDays(index * length);

        return (start, start.AddDays(length - 1));
    }
}
