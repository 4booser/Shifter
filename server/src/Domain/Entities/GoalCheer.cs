namespace Shifter.Domain.Entities;

/// <summary>One crossed goal, kept.</summary>
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
