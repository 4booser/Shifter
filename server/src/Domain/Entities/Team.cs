namespace Shifter.Domain.Entities;

/// <summary>
/// A crew that shares a rota. Deliberately thin: it exists so people can see
/// when the others are on, and nothing about it touches money.
/// </summary>
public sealed class Team
{
    public int Id { get; set; }

    public required string Name { get; set; }

    /// <summary>Who may rename it, remove people and delete it.</summary>
    public int OwnerUserId { get; set; }

    /// <summary>
    /// What someone types to join. Regenerable, because a code that leaked
    /// into the wrong chat is the only realistic way in for a stranger.
    /// </summary>
    public required string InviteCode { get; set; }

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    public List<TeamMember>? Members { get; set; }
}

public sealed class TeamMember
{
    public int Id { get; set; }

    public int TeamId { get; set; }
    public Team? Team { get; set; }

    public int UserId { get; set; }
    public User? User { get; set; }

    /// <summary>
    /// How this person appears to the others. Their own, not taken from the
    /// account: a rota reads better with the name the shift list uses.
    /// </summary>
    public required string DisplayName { get; set; }

    public DateTime JoinedAt { get; set; } = DateTime.UtcNow;
}
