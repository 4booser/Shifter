namespace Shifter.Domain.Entities;

/// <summary>
/// A crew that shares a rota. It exists so people can see when the others are
/// on; what each of them earns is nobody's business unless they say otherwise,
/// which is what <see cref="TeamMember.ShareEarnings"/> is for.
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

    /// <summary>
    /// The colour this person is drawn in on the shared calendar. Their own
    /// choice rather than a hash of their name: a crew works out between
    /// themselves who is which colour, and a hash cannot be argued with.
    /// </summary>
    public required string Colour { get; set; }

    /// <summary>
    /// Opt-in, and off for everyone who joined before it existed. When it is
    /// off the rota query does not read this person's pay at all — it is not
    /// fetched and then withheld, so there is nothing to leak.
    /// </summary>
    public bool ShareEarnings { get; set; }

    /// <summary>
    /// May plan other people's time on the board. The owner always may;
    /// this hands the same board to a shift lead without handing over the
    /// team itself.
    /// </summary>
    public bool IsManager { get; set; }

    /// <summary>
    /// What an unmarked shift does. Off means the crew sees this person's
    /// shifts unless one is marked private; on inverts it, so nothing shows
    /// until it is deliberately shared. Someone holding two jobs wants the
    /// second one, and the per-shift flag alone would make them mark every
    /// shift they place for the rest of the year.
    /// </summary>
    public bool PrivateByDefault { get; set; }

    /// <summary>
    /// Still learning the room.
    ///
    /// The rota does not otherwise know that a Friday night has two new
    /// people on it and nobody who has closed before, which is a thing the
    /// crew finds out at eleven o'clock.
    ///
    /// Set by the person themselves, not by an owner. Whether somebody counts
    /// as new is a fact about their own employment, and a flag an employer can
    /// put on somebody is a flag that outlives the reason for it.
    /// </summary>
    public bool Trainee { get; set; }

    /// <summary>
    /// When the trial ends, where one was agreed. Null means nobody said.
    ///
    /// It exists to be counted down to: a trial that ends usually means a rate
    /// that moves, and the date is the thing everybody forgets until a month
    /// after it passed.
    /// </summary>
    public DateOnly? TrialEndsOn { get; set; }

    public DateTime JoinedAt { get; set; } = DateTime.UtcNow;
}
