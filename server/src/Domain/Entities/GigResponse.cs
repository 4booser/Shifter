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

    /// <summary>
    /// When somebody first looked at the contacts this person handed over.
    ///
    /// Transparency for transparency. The board asks people for a phone number
    /// and then goes quiet about where it went; the least it can do is say who
    /// opened it and when. Nobody has to ask for this — it is shown to the
    /// person whose number it is, next to the number.
    ///
    /// Only the listing's owner can ever see contacts, so one row of counters
    /// describes the whole audience. A table of viewers would be a table with
    /// one name in it.
    /// </summary>
    public DateTime? ContactSeenAt { get; set; }

    public DateTime? ContactSeenLastAt { get; set; }

    /// <summary>
    /// Separate occasions, not page loads. A venue with the tab open all
    /// evening has looked once, and counting refreshes would turn an honest
    /// log into an accusation.
    /// </summary>
    public int ContactSeenCount { get; set; }

    /// <summary>
    /// How far apart two looks have to be to count as two.
    ///
    /// Fifteen minutes: long enough that a page left open does not tick, short
    /// enough that coming back after a shift to check a number is its own
    /// visit, which is the thing worth knowing.
    /// </summary>
    public const int SeenApartMinutes = 15;

    /// <summary>
    /// Whether reading this reply right now is a new look at somebody's
    /// contacts.
    ///
    /// False where nothing was ever shared: a "0 views" line about a number
    /// nobody gave is noise dressed as a privacy feature. False again inside
    /// the window, so a tab left open all evening stays one visit.
    /// </summary>
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
