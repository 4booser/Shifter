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

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime LastSeenAt { get; set; } = DateTime.UtcNow;
}
