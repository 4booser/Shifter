namespace Shifter.Domain.Entities;

/// <summary>
/// How often a job pays out. Totals are cut along these boundaries because a
/// calendar month is useless to someone paid on the 10th and the 25th.
/// </summary>
public enum PayPeriod
{
    Monthly = 0,
    /// <summary>Twice a month: 1st to 15th, then 16th to the end.</summary>
    SemiMonthly = 1,
    BiWeekly = 2,
    Weekly = 3
}
