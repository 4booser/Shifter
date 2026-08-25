using System.Text.Json.Serialization;

namespace Shifter.Application.Features.Push;

/// <summary>What the browser sends when it turns notifications on.</summary>
public sealed class PushSubscribeDto
{
    [JsonPropertyName("endpoint")] public required string Endpoint { get; set; }
    [JsonPropertyName("p256dh")] public required string P256dh { get; set; }
    [JsonPropertyName("auth")] public required string Auth { get; set; }
    [JsonPropertyName("time_zone")] public required string TimeZone { get; set; }
    [JsonPropertyName("language")] public required string Language { get; set; }
    [JsonPropertyName("notify_tomorrow")] public bool NotifyTomorrow { get; set; }
    [JsonPropertyName("notify_unclosed")] public bool NotifyUnclosed { get; set; }
    /// <summary>"HH:mm" on this device's clock.</summary>
    [JsonPropertyName("notify_at")] public required string NotifyAt { get; set; }
}

public sealed class PushUnsubscribeDto
{
    [JsonPropertyName("endpoint")] public required string Endpoint { get; set; }
}
