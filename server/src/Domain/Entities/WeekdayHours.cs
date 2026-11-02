namespace Shifter.Domain.Entities;

/// <summary>One weekday's own hours on a template, where they differ from its usual ones.</summary>
public sealed class WeekdayHours
{
    /// <summary>ISO: Monday is 1, Sunday is 7.</summary>
    public int Weekday { get; set; }

    public TimeOnly StartTime { get; set; }
    public TimeOnly EndTime { get; set; }
}
