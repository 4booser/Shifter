using System.ComponentModel.DataAnnotations.Schema;

namespace Shifter.Domain.Entities;

/// <summary>
/// One shift placed on one day. An entity rather than a bare join table for two
/// reasons: it carries a snapshot of the rate, so editing a template no longer
/// rewrites what past days earned, and it records whether the shift was
/// actually worked or is still only planned.
/// </summary>
public sealed class DayShift
{
    public int Id { get; set; }

    public int DayId { get; set; }
    public Day? Day { get; set; }

    public int ShiftId { get; set; }
    public Shift? Shift { get; set; }

    // Copied from the template when the shift is placed.
    public SalaryPeriod SalaryPeriod { get; set; }
    public decimal? SalaryAmount { get; set; }
    public TimeOnly StartTime { get; set; }
    public TimeOnly EndTime { get; set; }
    public int BreakMinutes { get; set; }

    /// <summary>
    /// False means planned. Totals keep the two apart so a month of future
    /// shifts is not reported as money already earned.
    /// </summary>
    public bool Worked { get; set; }

    /// <summary>
    /// Raised when this shift needs someone to take it. Visible to the whole
    /// team on the shared rota, which is the point: the alternative is a
    /// message in a group chat that scrolls away in ten minutes.
    /// </summary>
    public bool NeedsCover { get; set; }

    /// <summary>Clock time between start and end, wrapping past midnight.</summary>
    [NotMapped]
    public TimeSpan Duration
    {
        get
        {
            TimeSpan span = EndTime - StartTime;

            return span < TimeSpan.Zero ? span + TimeSpan.FromDays(1) : span;
        }
    }

    [NotMapped]
    public TimeSpan PaidDuration
    {
        get
        {
            TimeSpan paid = Duration - TimeSpan.FromMinutes(BreakMinutes);

            return paid < TimeSpan.Zero ? TimeSpan.Zero : paid;
        }
    }

    /// <summary>
    /// What this placement adds to its day. Weekly and monthly wages earn
    /// nothing per shift — they are paid once per period and land on the range
    /// summary instead.
    /// </summary>
    [NotMapped]
    public decimal Pay => SalaryPeriod switch
    {
        SalaryPeriod.Hour => (SalaryAmount ?? 0m) * (decimal)PaidDuration.TotalHours,
        SalaryPeriod.Day => SalaryAmount ?? 0m,
        _ => 0m
    };

    [NotMapped]
    public bool IsPeriodSalary =>
        SalaryPeriod is SalaryPeriod.Week or SalaryPeriod.Month;

    /// <summary>Takes the template's terms as they stand right now.</summary>
    public static DayShift From(Shift shift, bool worked) => new DayShift
    {
        ShiftId = shift.Id,
        Shift = shift,
        SalaryPeriod = shift.SalaryPeriod,
        SalaryAmount = shift.SalaryAmount,
        StartTime = shift.StartTime,
        EndTime = shift.EndTime,
        BreakMinutes = (int)Math.Round(
            (shift.Duration - shift.PaidDuration).TotalMinutes),
        Worked = worked
    };
}
