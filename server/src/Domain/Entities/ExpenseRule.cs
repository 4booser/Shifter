namespace Shifter.Domain.Entities;

/// <summary>A cost that comes round: a travel pass, a locker, the monthly whip-round for the staff room, a course paid in…</summary>
public sealed class ExpenseRule
{
    public const int NoteMax = 200;

    public int Id { get; set; }

    public int UserId { get; set; }
    public User? User { get; set; }

    /// <summary>Which place makes it necessary, where that is knowable.</summary>
    public int? LocationId { get; set; }
    public Location? Location { get; set; }

    public decimal Amount { get; set; }

    /// <summary>transport, uniform, tools, food, training or other.</summary>
    public string Kind { get; set; } = "other";

    public required string Note { get; set; }

    /// <summary>"month" or "week".</summary>
    public string Period { get; set; } = "month";

    /// <summary>Which day of the month it lands on, 1 to 28.</summary>
    public int DayOfMonth { get; set; } = 1;

    /// <summary>Monday = 0, for a weekly rhythm.</summary>
    public int Weekday { get; set; }

    public DateOnly StartsOn { get; set; }

    /// <summary>Inclusive. Null runs until somebody stops it.</summary>
    public DateOnly? EndsOn { get; set; }

    /// <summary>Occurrences called off, as ISO days, comma-joined.</summary>
    public string SkippedDays { get; set; } = string.Empty;

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}
