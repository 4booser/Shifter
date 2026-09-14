namespace Shifter.Domain.Entities;

/// <summary>How often a job pays out.</summary>
public enum PayPeriod
{
    Monthly = 0,
    /// <summary>Twice a month: 1st to 15th, then 16th to the end.</summary>
    SemiMonthly = 1,
    BiWeekly = 2,
    Weekly = 3
}
