namespace Shifter.Domain.Entities;

public sealed class Day
{
    public int Id { get; set; }
    public int UserId { get; set; }

    /// <summary>
    /// The navigation is what makes the foreign key real. Without it a deleted
    /// account left every day it ever recorded — dates, hours, wages, tips,
    /// fines, notes — in the database forever under an id that no longer
    /// exists.
    /// </summary>
    public User? User { get; set; }
    
    public List<DayShift>? Shifts {get; set;}
    
    public List<DaySale>? Sales { get; set; }
    /// <summary>Total tips for the day, however they arrived.</summary>
    public decimal? Tips { get; set; }

    /// <summary>
    /// The part of Tips taken in cash. Card tips are the remainder — hospitality
    /// work splits these because they are taxed and paid out differently.
    /// </summary>
    public decimal? TipsCash { get; set; }

    /// <summary>
    /// The day's tip pool before it is split — what the room took, not what
    /// this person keeps. Their own share lands in Tips, worked out from the
    /// shift's agreed percentage, so every reader of Tips keeps reading the
    /// one number that means "mine".
    /// </summary>
    public decimal? TipPool { get; set; }
    /// <summary>
    /// Fines, breakages, till shortfalls — anything the day cost rather than
    /// earned. Kept apart from tip-out so the reasons stay legible.
    /// </summary>
    public decimal? Deductions { get; set; }

    /// <summary>
    /// Why the day cost money: "breakage", "shortfall", "late", "waste",
    /// "uniform" or "other". Null on every day recorded before the reason
    /// existed, and on any day where nobody bothered to say.
    ///
    /// One reason per day rather than a list, matching how tips and the pool
    /// are already kept: a day usually has one thing go wrong, and a table for
    /// the rare second one would cost more than it explains. What it buys is
    /// the difference between "₴1 200 in fines" and "₴900 of that was the till
    /// coming up short" — the first is bad luck, the second is a question.
    /// </summary>
    public string? DeductionReason { get; set; }

    public string? Note { get; set; }

    /// <summary>
    /// A colour the person put on the day themselves, as "#RRGGBB". Independent
    /// of the shifts on it: a day can be marked without anything being placed,
    /// and a day full of shifts can still be singled out. Null means the cell
    /// takes its colour from what is on it, as it always did.
    /// </summary>
    public string? Colour { get; set; }

    public required DateOnly Date { get; set; }
}