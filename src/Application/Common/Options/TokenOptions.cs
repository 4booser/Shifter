namespace Shifter.Application.Common.Options;

/// <summary>
/// Bound from the "TokenOptions" configuration section. Both token issuing
/// (JwtService) and token validation (the JWT bearer scheme) read these, so the
/// two cannot drift apart.
/// </summary>
public class TokenOptions
{
    public const string SectionName = "TokenOptions";

    /// <summary>HMAC-SHA256 signing key. Must be at least 32 bytes.</summary>
    public string Key { get; set; } = string.Empty;

    public string Issuer { get; set; } = string.Empty;

    public string Audience { get; set; } = string.Empty;

    public int AccessTokenLifetimeMinutes { get; set; } = 15;

    public int RefreshTokenLifetimeDays { get; set; } = 7;
}
