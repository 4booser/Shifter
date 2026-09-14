namespace Shifter.Domain.Entities;

/// <summary>A phone that agreed to be notified.</summary>
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

    /// <summary>Where the phone is, so an evening nudge arrives in the evening.</summary>
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

    /// <summary>The local date each nudge last went out.</summary>
    public DateOnly? TomorrowSentOn { get; set; }
    public DateOnly? PaydaySentOn { get; set; }

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime LastSeenAt { get; set; } = DateTime.UtcNow;
}
