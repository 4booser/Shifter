namespace Shifter.Domain.Entities;

/// <summary>Somebody saying "I'll take that shift".</summary>
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

    /// <summary>The placement being offered around, or null once it has been accepted and the placement deleted.</summary>
    public int? DayShiftId { get; set; }

    public required DateOnly Date { get; set; }
    public required string ShiftName { get; set; }
    public TimeOnly StartTime { get; set; }
    public TimeOnly EndTime { get; set; }

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    /// <summary>Set when the owner hands the shift over.</summary>
    public DateTime? AcceptedAt { get; set; }

    public bool Accepted => AcceptedAt is not null;
}
