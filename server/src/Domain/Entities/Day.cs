namespace Shifter.Domain.Entities;

public sealed class Day
{
    public int Id { get; set; }
    public int UserId { get; set; }
    
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