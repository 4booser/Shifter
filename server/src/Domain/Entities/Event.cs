namespace Shifter.Domain.Entities;

/// <summary>Something that occupies days without being work: leave, sickness, a course, a birthday.</summary>
public sealed class Event
{
    public int Id { get; set; }

    public int UserId { get; set; }
    public User? User { get; set; }

    public required string Name { get; set; }

    /// <summary>What kind of non-working day this is.</summary>
    public EventKind Kind { get; set; } = EventKind.Ordinary;

    /// <summary>A short badge for the calendar, same idea as on a shift template: a string rather than a char so it can hold…</summary>
    public string? Symbol { get; set; }

    /// <summary>"#RRGGBB". Always set — an event with no colour is invisible.</summary>
    public required string Colour { get; set; }

    public required DateOnly StartDate { get; set; }

    /// <summary>Inclusive, and equal to <see cref="StartDate"/> for a single day.</summary>
    public required DateOnly EndDate { get; set; }

    /// <summary>Optional: an event may be all day.</summary>
    public TimeOnly? StartTime { get; set; }
    public TimeOnly? EndTime { get; set; }

    public string? Note { get; set; }

    /// <summary>What this event cost, per occurrence.</summary>
    public decimal Cost { get; set; }

    /// <summary>The palette entry it came from, kept for grouping — "how much did English cost me this year" is the question…</summary>
    public int? TemplateId { get; set; }
    public EventTemplate? Template { get; set; }

    /// <summary>Weekday numbers the event repeats on, comma-joined, Monday = 0.</summary>
    public string? RepeatWeekdays { get; set; }

    /// <summary>Inclusive end of the repetition; null repeats indefinitely.</summary>
    public DateOnly? RepeatUntil { get; set; }

    public bool Repeats => RepeatWeekdays is not null;

    /// <summary>Whether this event covers the given date.</summary>
    public bool Covers(DateOnly date) => date >= StartDate && date <= EndDate;

    public int Days => EndDate.DayNumber - StartDate.DayNumber + 1;
}
