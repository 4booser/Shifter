namespace Shifter.Domain.Entities;

/// <summary>How long a goal covers.</summary>
public enum GoalPeriod
{
    Day = 0,
    Week = 1,
    Month = 2,
    Year = 3,
}

/// <summary>
/// An amount to aim for over some stretch of time.
///
/// The single monthly figure this replaces could only answer one question. In
/// practice people hold several at once and of different shapes: a daily number
/// to decide whether to pick up a shift, a monthly one for the rent, and a
/// standing figure for every year. Those are the same idea at different scales,
/// so they are one row type rather than three.
/// </summary>
public sealed class Goal
{
    public int Id { get; set; }

    public int UserId { get; set; }
    public User? User { get; set; }

    public GoalPeriod Period { get; set; }

    /// <summary>What to reach in one of those periods. Always above zero.</summary>
    public decimal Amount { get; set; }

    /// <summary>
    /// Null for a standing goal — every month, every day, whichever the period
    /// is. Set to any date inside one period to mean that period alone: "45 000
    /// this December" rather than "45 000 a month". A specific goal wins over a
    /// standing one of the same period, so a busy month can carry its own
    /// number without disturbing the rule.
    /// </summary>
    public DateOnly? Anchor { get; set; }

    /// <summary>Shown beside the figure; the reason it is that number.</summary>
    public string? Note { get; set; }
}
