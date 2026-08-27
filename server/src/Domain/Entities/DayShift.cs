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
    public decimal? RevenuePercent { get; set; }
    public TipSource TipSource { get; set; }
    public decimal? TipPoolPercent { get; set; }

    /// <summary>
    /// What this shift took, entered after the fact — the only number in the
    /// pay that the template cannot know in advance. Null is "not counted",
    /// which is different from zero and is why a percentage shift with no
    /// takings recorded pays its base and nothing more.
    /// </summary>
    public decimal? Revenue { get; set; }
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

    /// <summary>
    /// Whether the crew sees this one. Null defers to the member's own default
    /// for the team, which is what almost every shift will be; true and false
    /// are the deliberate exceptions to it.
    ///
    /// Three states rather than two because the answer is genuinely "I have not
    /// said" for most shifts, and collapsing that into either yes or no makes
    /// changing the default rewrite history.
    /// </summary>
    public bool? TeamVisible { get; set; }

    /// <summary>
    /// When the shift actually started, where that differs from the plan. Set
    /// by the live clock or by hand; null keeps the template's word for it.
    /// Both must be present to count — one honest edge and one planned edge
    /// would price an interval nobody worked.
    /// </summary>
    public TimeOnly? ActualStart { get; set; }

    public TimeOnly? ActualEnd { get; set; }

    /// <summary>Clock time between start and end, wrapping past midnight.
    /// The recorded reality wins over the plan when both edges exist.</summary>
    [NotMapped]
    public TimeSpan Duration
    {
        get
        {
            (TimeOnly from, TimeOnly to) =
                ActualStart is TimeOnly begin && ActualEnd is TimeOnly finish
                    ? (begin, finish)
                    : (StartTime, EndTime);

            TimeSpan span = to - from;

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
    /// <summary>The rate alone, before any share of the takings.</summary>
    [NotMapped]
    public decimal BasePay => SalaryPeriod switch
    {
        SalaryPeriod.Hour => (SalaryAmount ?? 0m) * (decimal)PaidDuration.TotalHours,
        SalaryPeriod.Day => SalaryAmount ?? 0m,
        _ => 0m
    };

    /// <summary>The agreed share of what the shift took.</summary>
    [NotMapped]
    public decimal RevenuePay => (Revenue ?? 0m) * (RevenuePercent ?? 0m) / 100m;

    [NotMapped]
    public decimal Pay => BasePay + RevenuePay;

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
        RevenuePercent = shift.RevenuePercent,
        TipSource = shift.TipSource,
        TipPoolPercent = shift.TipPoolPercent,
        StartTime = shift.StartTime,
        EndTime = shift.EndTime,
        BreakMinutes = (int)Math.Round(
            (shift.Duration - shift.PaidDuration).TotalMinutes),
        Worked = worked
    };
}
