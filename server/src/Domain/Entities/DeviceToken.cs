namespace Shifter.Domain.Entities;

/// <summary>
/// A phone that agreed to be notified. Kept apart from the browser's push
/// subscription because the two channels fail differently: a browser
/// endpoint dies with the browser profile, a device token dies when the app
/// is reinstalled, and the same person may well have both.
/// </summary>
public sealed class DeviceToken
{
    public int Id { get; set; }

    public int UserId { get; set; }
    public User? User { get; set; }

    /// <summary>The Expo push token: "ExponentPushToken[...]".</summary>
    public required string Token { get; set; }

    /// <summary>"ios" | "android" — only for reading the table by eye.</summary>
    public required string Platform { get; set; }

    /// <summary>Which language the phone wants its notifications in.</summary>
    public string Language { get; set; } = "ru";

    /// <summary>
    /// Where the phone is, so an evening nudge arrives in the evening. Sent by
    /// the app; Kyiv until it says otherwise, because that is who this is for.
    /// </summary>
    public string TimeZone { get; set; } = "Europe/Kyiv";

    /// <summary>"HH:mm" the evening nudge is wanted at, in that zone.</summary>
    public string NotifyAt { get; set; } = "19:00";

    /// <summary>Tomorrow's shift, the evening before.</summary>
    public bool NotifyTomorrow { get; set; } = true;

    /// <summary>Money due today, mid-morning.</summary>
    public bool NotifyPayday { get; set; } = true;

    /// <summary>Evening knock about yesterday's recorded-but-unclosed day.</summary>
    public bool NotifyUnclosed { get; set; } = true;

    public DateOnly? UnclosedSentOn { get; set; }

    /// <summary>
    /// The local date each nudge last went out. Stamped rather than counted,
    /// so however often the loop runs — or however long the process was down —
    /// a phone hears about a given day exactly once.
    /// </summary>
    public DateOnly? TomorrowSentOn { get; set; }
    public DateOnly? PaydaySentOn { get; set; }

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime LastSeenAt { get; set; } = DateTime.UtcNow;
}
