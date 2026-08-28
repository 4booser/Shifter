namespace Shifter.Domain.Entities;

/// <summary>
/// A kind of event somebody has again and again: «английский», «вождение»,
/// the gym on Tuesdays. The same idea as a shift template and for the same
/// reason — the calendar is filled by picking a thing and putting it on days,
/// and typing "английский, 19:00–20:30, 400" out afresh every week is exactly
/// the friction that makes people stop filling it in.
///
/// It carries money, which an <see cref="Event"/> deliberately did not. The
/// direction is the whole difference: a shift is what the week pays, an event
/// is what the week costs, and the two are never added together — a lesson
/// worth stating here because the temptation to net them off is constant.
/// </summary>
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

    /// <summary>
    /// What one of these usually costs. Null means it costs nothing worth
    /// recording, which is different from zero: zero is somebody saying the
    /// lesson was free this week.
    /// </summary>
    public decimal? Cost { get; set; }

    /// <summary>
    /// Kept rather than deleted, like a shift template: the events already on
    /// the calendar carry their own copy of everything, so removing the row
    /// would be safe — but the palette is a list of choices, and somebody who
    /// stops taking lessons in June wants the option gone, not the spring
    /// rewritten.
    /// </summary>
    public bool Archived { get; set; }

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}
