namespace Shifter.Application.Features.Push;

/// <summary>VAPID material.</summary>
public sealed class PushOptions
{
    public const string Section = "Push";

    public string PublicKey { get; set; } = "";
    public string PrivateKey { get; set; } = "";

    /// <summary>A mailto: the push services may use to reach the operator.</summary>
    public string Subject { get; set; } = "mailto:4booser@gmail.com";

    public bool Enabled => PublicKey != "" && PrivateKey != "";
}
