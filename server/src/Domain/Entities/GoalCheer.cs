namespace Shifter.Domain.Entities;

/// <summary>
/// One crossed goal, kept.
///
/// CelebratedOn on the goal itself remembers only the latest period — enough
/// to cheer once, useless as a history. This row is the trophy shelf's
/// material: which period, what the bar was, when it was crossed. Nothing
/// here is editable; a shelf you can rewrite is a story, not a record.
/// </summary>
public sealed class GoalCheer
{
    public int Id { get; set; }

    public int UserId { get; set; }
    public User? User { get; set; }

    public GoalPeriod Period { get; set; }

    /// <summary>The first day of the period that was closed.</summary>
    public DateOnly PeriodFrom { get; set; }

    /// <summary>The bar as it stood when crossed — later edits don't rewrite trophies.</summary>
    public decimal Amount { get; set; }

    public DateTime CelebratedAt { get; set; } = DateTime.UtcNow;
}
