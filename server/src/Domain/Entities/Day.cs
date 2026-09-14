namespace Shifter.Domain.Entities;

public sealed class Day
{
    public int Id { get; set; }
    public int UserId { get; set; }

    /// <summary>Paired with <see cref="User.CalendarDays"/>, which is what has always made the key real here — this side is…</summary>
    public User? User { get; set; }
    
    /// <summary>Bumped on every save.</summary>
    public int Version { get; set; }

    public List<DayShift>? Shifts {get; set;}
    
    public List<DaySale>? Sales { get; set; }
    /// <summary>Total tips for the day, however they arrived.</summary>
    public decimal? Tips { get; set; }

    /// <summary>The part of Tips taken in cash.</summary>
    public decimal? TipsCash { get; set; }

    /// <summary>The day's tip pool before it is split — what the room took, not what this person keeps.</summary>
    public decimal? TipPool { get; set; }
    /// <summary>Fines, breakages, till shortfalls — anything the day cost rather than earned.</summary>
    public decimal? Deductions { get; set; }

    /// <summary>Why the day cost money: "breakage", "shortfall", "late", "waste", "uniform" or "other".</summary>
    public string? DeductionReason { get; set; }

    public string? Note { get; set; }

    /// <summary>A colour the person put on the day themselves, as "#RRGGBB".</summary>
    public string? Colour { get; set; }

    public required DateOnly Date { get; set; }
}