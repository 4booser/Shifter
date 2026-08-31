using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace Shifter.Domain.Entities;

public sealed class Shift
{
    [Key]
    public int Id { get; set; }

    public int UserId { get; set; }

    // The navigation is what makes EF treat UserId as a real foreign key. With
    // the scalar alone it would just be an int column with no constraint.
    public User? User { get; set; }

    public required string Name { get; set; }
    
    /// <summary>
    /// A short badge for the calendar. A string rather than a char so it can
    /// hold an emoji: most sit outside the BMP and need two UTF-16 units.
    /// </summary>
    public string? Symbol { get; set; }

    /// <summary>
    /// The template's own colour, as "#RRGGBB". Null means it borrows its
    /// place's, which is where every shift's colour used to come from — fine
    /// while one place meant one kind of work, useless the moment a bar has an
    /// opening shift and a close that want telling apart at a glance.
    /// </summary>
    public string? Colour { get; set; }

    /// <summary>
    /// Whether a day carrying this shift paints itself in the shift's colour.
    ///
    /// The day has always had a colour of its own, set by hand — good for the
    /// one day somebody wants to mark, useless for "every вечер should be
    /// violet". A template that paints says it once and the calendar obeys
    /// forever; a day coloured by hand still wins, because a person saying
    /// something about one day outranks a standing rule.
    /// </summary>
    public bool PaintsDay { get; set; }

    /// <summary>
    /// Explicit foreign key alongside the Location navigation below, so the
    /// template can be assigned a place without loading one first.
    /// </summary>
    public int? LocationId { get; set; }

    /// <summary>
    /// One rate and the period it covers, replacing four nullable amounts where
    /// nothing said which of them applied.
    /// </summary>
    public SalaryPeriod SalaryPeriod { get; set; } = SalaryPeriod.Hour;
    public decimal? SalaryAmount { get; set; }

    /// <summary>
    /// A share of what the shift takes, paid on top of the rate rather than
    /// instead of it. Hospitality stacks the two far more often than it picks
    /// one — an hourly bartender on 3% of the bar is the ordinary case, not
    /// the exotic one — so this is a second field and not another
    /// SalaryPeriod. Null means the shift has no percentage at all.
    /// </summary>
    public decimal? RevenuePercent { get; set; }

    /// <summary>Where this shift's tips come from.</summary>
    public TipSource TipSource { get; set; } = TipSource.Personal;

    /// <summary>
    /// This person's slice of the day's pool, in percent, when the tips are
    /// pooled. Null with a pooled source means the split is not agreed yet,
    /// and nothing is counted rather than a wrong number being invented.
    /// </summary>
    public decimal? TipPoolPercent { get; set; }
    
    public required TimeOnly StartTime { get; set; }
    public required TimeOnly EndTime { get; set; }
    
    public Location? Location { get; set; }
    public List<Break>? Breaks { get; set; }

    // Placements of this template. The join is an entity now, so it can hold
    // the snapshot and the worked flag.
    public List<DayShift>? Placements { get; set; }
    
    // Public so EF maps it; the private setter keeps ToArchive the only way in.
    public bool Archived { get; private set; }

    public void ToArchive() => Archived = true;

    public void Restore() => Archived = false;

    /// <summary>
    /// Clock time between start and end. A night shift ends before it starts on
    /// the clock, so the span wraps into the next day.
    /// </summary>
    [NotMapped]
    public TimeSpan Duration
    {
        get
        {
            TimeSpan span = EndTime - StartTime;

            return span < TimeSpan.Zero ? span + TimeSpan.FromDays(1) : span;
        }
    }

    /// <summary>Duration less unpaid breaks, floored at zero.</summary>
    [NotMapped]
    public TimeSpan PaidDuration
    {
        get
        {
            TimeSpan breaks = Breaks is null
                ? TimeSpan.Zero
                : Breaks.Aggregate(TimeSpan.Zero, (total, rest) => total + BreakLength(rest));

            TimeSpan paid = Duration - breaks;

            return paid < TimeSpan.Zero ? TimeSpan.Zero : paid;
        }
    }

    /// <summary>
    /// What this shift adds to the day it sits on. Weekly and monthly wages
    /// earn nothing per shift — they are paid once per period regardless of how
    /// many shifts fall inside it, so they are added to the range summary.
    /// </summary>
    [NotMapped]
    public decimal Pay => SalaryPeriod switch
    {
        SalaryPeriod.Hour => (SalaryAmount ?? 0m) * (decimal)PaidDuration.TotalHours,
        SalaryPeriod.Day => SalaryAmount ?? 0m,
        _ => 0m
    };

    /// <summary>True when the rate is paid per period rather than per shift.</summary>
    [NotMapped]
    public bool IsPeriodSalary =>
        SalaryPeriod is SalaryPeriod.Week or SalaryPeriod.Month;

    private static TimeSpan BreakLength(Break rest)
    {
        if (rest.Duration is not null) return rest.Duration.Value;

        if (rest.StartTime is null || rest.EndTime is null) return TimeSpan.Zero;

        TimeSpan span = rest.EndTime.Value - rest.StartTime.Value;

        return span < TimeSpan.Zero ? span + TimeSpan.FromDays(1) : span;
    }
}