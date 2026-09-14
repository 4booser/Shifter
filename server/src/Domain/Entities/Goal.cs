namespace Shifter.Domain.Entities;

/// <summary>How long a goal covers.</summary>
public enum GoalPeriod
{
    Day = 0,
    Week = 1,
    Month = 2,
    Year = 3,
}

/// <summary>An amount to aim for over some stretch of time.</summary>
public sealed class Goal
{
    public int Id { get; set; }

    public int UserId { get; set; }
    public User? User { get; set; }

    public GoalPeriod Period { get; set; }

    /// <summary>What to reach in one of those periods. Always above zero.</summary>
    public decimal Amount { get; set; }

    /// <summary>Null for a standing goal — every month, every day, whichever the period is.</summary>
    public DateOnly? Anchor { get; set; }

    /// <summary>Shown beside the figure; the reason it is that number.</summary>
    public string? Note { get; set; }

    /// <summary>The start of the period this goal was last cheered for.</summary>
    public DateOnly? CelebratedOn { get; set; }
}
