namespace Shifter.Domain.Entities;

/// <summary>
/// "Я выйду" — one person's offer to work one listed gig. The contact fields
/// are copied in at the moment of consent, not joined from the profile:
/// what the owner sees is exactly what the person agreed to hand over, even
/// if the profile changes afterwards.
///
/// There are two ways to answer, and the difference is the whole point of
/// this class. Somebody who has decided hands the phone over with the first
/// message, which is right for them and far too much for somebody who is
/// still looking. The quiet answer says only "я присматриваюсь": the venue
/// sees the person, their card and their stars, and nothing to call. The
/// contacts open when both sides have said yes.
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

    /// <summary>
    /// When the person's contacts became the owner's to see. Null means they
    /// have not opened them, and then the two fields above are empty anyway —
    /// this is the second lock on the same door, because a contact shown to
    /// somebody it was not given to cannot be taken back.
    /// </summary>
    public DateTime? OpenedAt { get; set; }

    /// <summary>Set when the owner picks this person.</summary>
    public DateTime? AcceptedAt { get; set; }

    /// <summary>
    /// The venue's side of the same handshake, given at the moment it picks
    /// somebody. Being taken used to arrive as a notification and nothing
    /// else — the person knew they were in and had no way to ask when.
    /// </summary>
    public string? VenuePhone { get; set; }
    public string? VenueTelegram { get; set; }

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    /// <summary>
    /// Where this answer has got to, in one word, computed in one place so no
    /// screen has to work it out from two timestamps and get it wrong.
    ///
    /// quiet — asked about, nothing shared, nobody has said yes.
    /// direct — the person shared contacts with the first message.
    /// invited — the venue said yes and is waiting for the person's.
    /// open — both said yes; each side can reach the other.
    /// </summary>
    public string Stage => (AcceptedAt, OpenedAt) switch
    {
        (null, null) => "quiet",
        (null, not null) => "direct",
        (not null, null) => "invited",
        _ => "open",
    };

    /// <summary>What the owner may see. Never the field, always this.</summary>
    public string? SharedPhone => OpenedAt is null ? null : Phone;
    public string? SharedTelegram => OpenedAt is null ? null : Telegram;
}
