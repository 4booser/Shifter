namespace Shifter.Domain.Entities;

/// <summary>Where a leave request stands.</summary>
public enum LeaveStatus
{
    Pending = 0,
    Approved = 1,
    Declined = 2,
}

/// <summary>
/// "I want these two weeks off."
///
/// Deliberately not the same thing as blocking a day. Blocking says "I cannot
/// work Tuesday" and obliges nobody; a leave request covers a stretch, needs an
/// answer, and the answer has consequences — an unanswered one is a cancelled
/// flight. So it carries a status, who decided, and when.
/// </summary>
public sealed class LeaveRequest
{
    public const int ReasonMax = 200;

    /// <summary>
    /// Long enough for a season, short enough that a typo in the year cannot
    /// block a person out of the rota for a decade.
    /// </summary>
    public const int MaxDays = 120;

    public int Id { get; set; }

    public int TeamId { get; set; }
    public Team? Team { get; set; }

    /// <summary>Who is asking.</summary>
    public int UserId { get; set; }

    public required DateOnly From { get; set; }
    public required DateOnly To { get; set; }

    /// <summary>Optional: "свадьба", "экзамены". Visible to whoever decides.</summary>
    public string? Reason { get; set; }

    public LeaveStatus Status { get; set; } = LeaveStatus.Pending;

    /// <summary>
    /// Who answered, and what they said. Null while it is still waiting, which
    /// is the state the whole thing exists to make visible.
    /// </summary>
    public int? DecidedByUserId { get; set; }
    public DateTime? DecidedAt { get; set; }
    public string? DecisionNote { get; set; }

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    /// <summary>Whether this request covers a given day.</summary>
    public bool Covers(DateOnly date) => date >= From && date <= To;

    public int Days => To.DayNumber - From.DayNumber + 1;
}
