namespace Shifter.Domain.Entities;

/// <summary>A crew that shares a rota.</summary>
public sealed class Team
{
    public int Id { get; set; }

    public required string Name { get; set; }

    /// <summary>Who may rename it, remove people and delete it.</summary>
    public int OwnerUserId { get; set; }

    /// <summary>What someone types to join.</summary>
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

    /// <summary>How this person appears to the others.</summary>
    public required string DisplayName { get; set; }

    /// <summary>The colour this person is drawn in on the shared calendar.</summary>
    public required string Colour { get; set; }

    /// <summary>Opt-in, and off for everyone who joined before it existed.</summary>
    public bool ShareEarnings { get; set; }

    /// <summary>May plan other people's time on the board.</summary>
    public bool IsManager { get; set; }

    /// <summary>What an unmarked shift does.</summary>
    public bool PrivateByDefault { get; set; }

    /// <summary>Still learning the room.</summary>
    public bool Trainee { get; set; }

    /// <summary>When the trial ends, where one was agreed.</summary>
    public DateOnly? TrialEndsOn { get; set; }

    public DateTime JoinedAt { get; set; } = DateTime.UtcNow;
}
