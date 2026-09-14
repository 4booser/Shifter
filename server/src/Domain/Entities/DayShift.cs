using System.ComponentModel.DataAnnotations.Schema;

namespace Shifter.Domain.Entities;

/// <summary>One shift placed on one day.</summary>
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

    /// <summary>What this shift took, entered after the fact — the only number in the pay that the template cannot know in…</summary>
    public decimal? Revenue { get; set; }

    /// <summary>How many people the shift served.</summary>
    public int? Guests { get; set; }

    /// <summary>Where in the venue it was worked.</summary>
    public ShiftZone Zone { get; set; } = ShiftZone.Unset;

    public TimeOnly StartTime { get; set; }
    public TimeOnly EndTime { get; set; }
    public int BreakMinutes { get; set; }

    /// <summary>False means planned.</summary>
    public bool Worked { get; set; }

    /// <summary>Raised when this shift needs someone to take it.</summary>
    public bool NeedsCover { get; set; }

    /// <summary>Whether the crew sees this one.</summary>
    public bool? TeamVisible { get; set; }

    /// <summary>When the shift actually started, where that differs from the plan.</summary>
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

    /// <summary>What this placement adds to its day.</summary>
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
