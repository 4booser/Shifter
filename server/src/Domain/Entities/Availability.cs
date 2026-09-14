namespace Shifter.Domain.Entities;

/// <summary>"I cannot work that day." One row per person per day they have blocked, scoped to a team because availability…</summary>
public sealed class Availability
{
    public const int ReasonMax = 80;

    public int Id { get; set; }

    public int TeamId { get; set; }
    public Team? Team { get; set; }

    public int UserId { get; set; }
    public User? User { get; set; }

    public required DateOnly Date { get; set; }

    /// <summary>Optional and short: "экзамен", "поезд". Visible to the crew.</summary>
    public string? Reason { get; set; }

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}
