namespace Shifter.Domain.Entities;

/// <summary>
/// A cost that comes round: a travel pass, a locker, the monthly whip-round
/// for the staff room, a course paid in instalments.
///
/// Nobody records these. Recording something is a thing you do when you are
/// thinking about it, and the whole nature of a standing cost is that you are
/// not — it leaves, and it is noticed at the end of the month when the number
/// does not add up.
///
/// The occurrences are conjured at read time from this rule rather than
/// written into the table by a scheduler. It is the same choice the calendar
/// makes for a repeating event, and for the same reasons: nothing to run,
/// nothing to run twice, and a rule edited in June does not rewrite May.
/// </summary>
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

    /// <summary>
    /// Which day of the month it lands on, 1 to 28.
    ///
    /// Twenty-eight rather than thirty-one, the same as a payday: a charge on
    /// the 31st would skip February, and a rule that quietly skips a month is
    /// worse than one that asks for a day that exists everywhere.
    /// </summary>
    public int DayOfMonth { get; set; } = 1;

    /// <summary>Monday = 0, for a weekly rhythm.</summary>
    public int Weekday { get; set; }

    public DateOnly StartsOn { get; set; }

    /// <summary>Inclusive. Null runs until somebody stops it.</summary>
    public DateOnly? EndsOn { get; set; }

    /// <summary>
    /// Occurrences called off, as ISO days, comma-joined.
    ///
    /// One button, one month: the pass is not bought in August because
    /// August is holiday. It is not an edit to the rule — the rule is still
    /// true — and next month it comes back by itself, which is what somebody
    /// pressing "skip" means and not what deleting would do.
    /// </summary>
    public string SkippedDays { get; set; } = string.Empty;

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}
