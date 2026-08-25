namespace Shifter.Application.Features.Push;

/// <summary>
/// VAPID material. All three empty means the feature is off: the endpoints
/// answer 404 and the scheduler never starts a pass, so a deployment without
/// keys is merely a deployment without notifications, not a broken one.
/// </summary>
public sealed class PushOptions
{
    public const string Section = "Push";

    public string PublicKey { get; set; } = "";
    public string PrivateKey { get; set; } = "";

    /// <summary>A mailto: the push services may use to reach the operator.</summary>
    public string Subject { get; set; } = "mailto:4booser@gmail.com";

    public bool Enabled => PublicKey != "" && PrivateKey != "";
}
