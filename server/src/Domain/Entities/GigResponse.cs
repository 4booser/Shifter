namespace Shifter.Domain.Entities;

/// <summary>
/// "Я выйду" — one person's offer to work one listed gig. The contact fields
/// are copied in at the moment of consent, not joined from the profile:
/// what the owner sees is exactly what the person agreed to hand over, even
/// if the profile changes afterwards.
/// </summary>
public sealed class GigResponse
{
    public const int MessageMax = 300;
    public const int ContactMax = 80;

    public int Id { get; set; }

    public int ListingId { get; set; }
    public GigListing? Listing { get; set; }

    public int UserId { get; set; }
    public User? User { get; set; }

    public string? Message { get; set; }

    /// <summary>Null means the person chose not to share this channel.</summary>
    public string? Phone { get; set; }
    public string? Telegram { get; set; }

    /// <summary>Set when the owner picks this person.</summary>
    public DateTime? AcceptedAt { get; set; }

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}
