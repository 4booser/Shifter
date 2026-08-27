namespace Shifter.Domain.Entities;

/// <summary>
/// One browser that asked to be told things. The endpoint is the push
/// service's address for that browser; the two keys encrypt payloads to it.
/// Preferences live here rather than on the user because they are per-device
/// facts: a phone wants the evening nudge, the desk machine does not.
/// </summary>
public sealed class PushSubscription
{
    public int Id { get; set; }

    public int UserId { get; set; }
    public User? User { get; set; }

    /// <summary>The push service URL; unique per browser registration.</summary>
    public required string Endpoint { get; set; }

    public required string P256dh { get; set; }
    public required string Auth { get; set; }

    /// <summary>IANA zone name, e.g. "Europe/Kyiv" — the clock the nudges follow.</summary>
    public required string TimeZone { get; set; }

    /// <summary>"en", "ru" or "uk" — what language the notification speaks.</summary>
    public required string Language { get; set; }

    /// <summary>"Tomorrow you work X" the evening before.</summary>
    public bool NotifyTomorrow { get; set; }

    /// <summary>"Yesterday has no tips or sales on it yet."</summary>
    public bool NotifyUnclosed { get; set; }

    /// <summary>"A pay period lands today", sent mid-morning.</summary>
    public bool NotifyPayday { get; set; }

    /// <summary>The week in one line, Sunday evening.</summary>
    public bool NotifyDigest { get; set; }

    /// <summary>
    /// Warns while the week can still be changed: "38 of 40 hours". After the
    /// threshold the information is only useful for arguing about it.
    /// </summary>
    public bool NotifyOvertime { get; set; }

    /// <summary>
    /// Papers running out. On by default for nobody — but the first document
    /// somebody enters is a statement that they want to be told, and the
    /// settings screen says so.
    /// </summary>
    public bool NotifyDocuments { get; set; }

    /// <summary>Local "HH:mm" both nudges are sent at.</summary>
    public required string NotifyAt { get; set; }

    public DateTime CreatedAt { get; set; }

    /// <summary>
    /// The local date each kind last went out, so a scheduler pass never
    /// repeats itself inside one day however often it runs.
    /// </summary>
    public DateOnly? TomorrowSentOn { get; set; }

    public DateOnly? UnclosedSentOn { get; set; }

    public DateOnly? PaydaySentOn { get; set; }

    public DateOnly? DigestSentOn { get; set; }
    public DateOnly? OvertimeSentOn { get; set; }
    public DateOnly? DocumentsSentOn { get; set; }
}
