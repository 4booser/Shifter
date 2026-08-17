namespace Shifter.Domain.Entities;

/// <summary>
/// Something that occupies days without being work: leave, sickness, a course,
/// a birthday. Deliberately outside the money model — no rate, no hours, no
/// place of work — because the moment an event could pay, every total in the
/// application would have to account for it.
///
/// Stored as a range rather than a row per day: a fortnight off is one record,
/// and moving it is one edit instead of fourteen.
/// </summary>
public sealed class Event
{
    public int Id { get; set; }

    public int UserId { get; set; }
    public User? User { get; set; }

    public required string Name { get; set; }

    /// <summary>
    /// A short badge for the calendar, same idea as on a shift template: a
    /// string rather than a char so it can hold an emoji.
    /// </summary>
    public string? Symbol { get; set; }

    /// <summary>"#RRGGBB". Always set — an event with no colour is invisible.</summary>
    public required string Colour { get; set; }

    public required DateOnly StartDate { get; set; }

    /// <summary>
    /// Inclusive, and equal to <see cref="StartDate"/> for a single day. Both
    /// ends are stored even then, so nothing has to special-case the one-day
    /// case when reading.
    /// </summary>
    public required DateOnly EndDate { get; set; }

    /// <summary>
    /// Optional: an event may be all day. Times are shown but never counted —
    /// hours belong to shifts.
    /// </summary>
    public TimeOnly? StartTime { get; set; }
    public TimeOnly? EndTime { get; set; }

    public string? Note { get; set; }

    /// <summary>Whether this event covers the given date.</summary>
    public bool Covers(DateOnly date) => date >= StartDate && date <= EndDate;

    public int Days => EndDate.DayNumber - StartDate.DayNumber + 1;
}
