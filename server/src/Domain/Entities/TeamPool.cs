namespace Shifter.Domain.Entities;

/// <summary>The night's tip pool, entered once for the whole crew.</summary>
public sealed class TeamPool
{
    public int Id { get; set; }

    public int TeamId { get; set; }
    public Team? Team { get; set; }

    public required DateOnly Date { get; set; }

    /// <summary>What the room took, before it is split.</summary>
    public decimal Amount { get; set; }

    /// <summary>Who counted it.</summary>
    public int? EnteredByUserId { get; set; }
    public User? EnteredBy { get; set; }

    public DateTime EnteredAt { get; set; } = DateTime.UtcNow;
}
