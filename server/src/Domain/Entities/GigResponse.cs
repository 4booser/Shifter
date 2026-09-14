namespace Shifter.Domain.Entities;

/// <summary>"Я выйду" — one person's offer to work one listed gig.</summary>
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

    /// <summary>When the person's contacts became the owner's to see.</summary>
    public DateTime? OpenedAt { get; set; }

    /// <summary>Set when the owner picks this person.</summary>
    public DateTime? AcceptedAt { get; set; }

    /// <summary>The venue's side of the same handshake, given at the moment it picks somebody.</summary>
    public string? VenuePhone { get; set; }
    public string? VenueTelegram { get; set; }

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    /// <summary>Where this answer has got to, in one word, computed in one place so no screen has to work it out from two…</summary>
    public string Stage => (AcceptedAt, OpenedAt) switch
    {
        (null, null) => "quiet",
        (null, not null) => "direct",
        (not null, null) => "invited",
        _ => "open",
    };

    /// <summary>When somebody first looked at the contacts this person handed over.</summary>
    public DateTime? ContactSeenAt { get; set; }

    public DateTime? ContactSeenLastAt { get; set; }

    /// <summary>Separate occasions, not page loads.</summary>
    public int ContactSeenCount { get; set; }

    /// <summary>How far apart two looks have to be to count as two.</summary>
    public const int SeenApartMinutes = 15;

    /// <summary>Whether reading this reply right now is a new look at somebody's contacts.</summary>
    public bool IsNewLook(DateTime now)
    {
        if (OpenedAt is null) return false;
        if (Phone is null && Telegram is null) return false;

        return ContactSeenLastAt is null
            || ContactSeenLastAt < now.AddMinutes(-SeenApartMinutes);
    }

    /// <summary>What the owner may see. Never the field, always this.</summary>
    public string? SharedPhone => OpenedAt is null ? null : Phone;
    public string? SharedTelegram => OpenedAt is null ? null : Telegram;
}
