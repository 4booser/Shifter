namespace Shifter.Domain.Entities;

/// <summary>A kind of event somebody has again and again: «английский», «вождение», the gym on Tuesdays.</summary>
public sealed class EventTemplate
{
    public const int NameMax = 60;

    public int Id { get; set; }

    public int UserId { get; set; }
    public User? User { get; set; }

    public required string Name { get; set; }

    /// <summary>A badge for the calendar; a string so it can hold an emoji.</summary>
    public string? Symbol { get; set; }

    /// <summary>"#RRGGBB". Always set — an event with no colour is invisible.</summary>
    public required string Colour { get; set; }

    public EventKind Kind { get; set; } = EventKind.Ordinary;

    /// <summary>The usual hours. Null means the day is simply marked.</summary>
    public TimeOnly? StartTime { get; set; }
    public TimeOnly? EndTime { get; set; }

    /// <summary>What one of these usually costs.</summary>
    public decimal? Cost { get; set; }

    /// <summary>Kept rather than deleted, like a shift template: the events already on the calendar carry their own copy of…</summary>
    public bool Archived { get; set; }

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}
