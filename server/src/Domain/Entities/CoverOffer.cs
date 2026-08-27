namespace Shifter.Domain.Entities;

/// <summary>
/// Somebody saying "I'll take that shift". The other half of the cover request
/// that already existed: a person could raise a hand and nobody could answer.
///
/// The shift's facts are copied here rather than reached through the placement
/// it came from. Accepting deletes that placement — the owner is no longer
/// working it — and a row that pointed at it would vanish with it, taking the
/// record of who took what along too.
///
/// Nothing about money appears here or can be reached from here, which is the
/// same rule the rota itself follows: a crew coordinates without publishing
/// each other's wages.
/// </summary>
public sealed class CoverOffer
{
    public int Id { get; set; }

    public int TeamId { get; set; }
    public Team? Team { get; set; }

    /// <summary>Whose shift it is. They alone can accept an offer on it.</summary>
    public int OwnerUserId { get; set; }
    public User? Owner { get; set; }

    /// <summary>Who is offering to work it.</summary>
    public int ClaimantUserId { get; set; }
    public User? Claimant { get; set; }

    /// <summary>
    /// The placement being offered around, or null once it has been accepted
    /// and the placement deleted.
    /// </summary>
    public int? DayShiftId { get; set; }

    public required DateOnly Date { get; set; }
    public required string ShiftName { get; set; }
    public TimeOnly StartTime { get; set; }
    public TimeOnly EndTime { get; set; }

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    /// <summary>
    /// Set when the owner hands the shift over. The offer stays afterwards so
    /// both people can see what was agreed; the shift itself is gone from the
    /// owner's calendar and the person who took it places it on their own,
    /// because only they know what they are paid for it.
    /// </summary>
    public DateTime? AcceptedAt { get; set; }

    public bool Accepted => AcceptedAt is not null;
}
