using System.Security.Cryptography;
using System.Text;

namespace Shifter.Application.Features.Webhooks.Services;

/// <summary>Who is allowed to write to an endpoint.</summary>
public static class WebhookSignature
{
    public const string SignatureHeader = "X-Shifter-Signature";
    public const string TimestampHeader = "X-Shifter-Timestamp";
    public const string SecretHeader = "X-Shifter-Secret";

    /// <summary>How stale a signed request may be.</summary>
    public static readonly TimeSpan Window = TimeSpan.FromMinutes(5);

    /// <summary>The value the sender puts in the signature header.</summary>
    public static string Compute(string secret, string timestamp, string body)
    {
        byte[] hash = HMACSHA256.HashData(
            Encoding.UTF8.GetBytes(secret),
            Encoding.UTF8.GetBytes($"{timestamp}.{body}"));

        return "sha256=" + Convert.ToHexStringLower(hash);
    }

    /// <summary>Null when the request may be accepted, otherwise the reason it may not, in words meant for whoever is…</summary>
    public static string? Verify(
        string secret,
        string? signature,
        string? timestamp,
        string? presentedSecret,
        string body,
        DateTimeOffset now,
        string[]? presentHeaders = null)
    {
        if (!string.IsNullOrWhiteSpace(signature))
        {
            if (string.IsNullOrWhiteSpace(timestamp))
                return $"{SignatureHeader} was sent without {TimestampHeader}.";

            if (!long.TryParse(timestamp, out long epoch))
                return $"{TimestampHeader} must be a Unix time in seconds.";

            TimeSpan drift = now - DateTimeOffset.FromUnixTimeSeconds(epoch);

            if (drift.Duration() > Window)
            {
                return "The signed timestamp is outside the accepted window. "
                    + "Check the sender's clock.";
            }

            string expected = Compute(secret, timestamp.Trim(), body);

            return Matches(expected, signature.Trim())
                ? null
                : "The signature does not match the body.";
        }

        if (!string.IsNullOrWhiteSpace(presentedSecret))
        {
            return Matches(secret, presentedSecret.Trim())
                ? null
                : "The secret does not match this endpoint.";
        }

        string asked = $"Sign the request with {SignatureHeader}, or send the endpoint's "
            + $"secret in {SecretHeader}.";

        // A sender that signs under its own names looks exactly like one that
        // sends nothing, and the owner cannot see the request to tell them
        // apart. Names only: the values are the very things being protected.
        if (presentHeaders is { Length: > 0 })
        {
            asked += " The request did carry: " + string.Join(", ", presentHeaders)
                + " — this endpoint does not read those.";
        }

        return asked;
    }

    /// <summary>The other direction: a sender that signs under its own scheme and will not be told to do otherwise.</summary>
    public static string? VerifySender(
        string secret,
        string? value,
        string body,
        DateTimeOffset now)
    {
        if (string.IsNullOrWhiteSpace(value))
            return "The sender's signature header was not present.";

        long? stamp = null;
        List<string> offered = [];

        foreach (string part in value.Split(',', StringSplitOptions.TrimEntries))
        {
            int equals = part.IndexOf('=');

            if (equals <= 0) continue;

            string key = part[..equals];
            string element = part[(equals + 1)..];

            if (key == "t" && long.TryParse(element, out long parsed)) stamp = parsed;

            // v1 today; a sender that moves to v2 keeps sending v1 alongside it
            // for exactly this reason, so anything else is left alone.
            if (key == "v1") offered.Add(element);
        }

        if (stamp is not long moment)
            return $"The signature carried no timestamp: expected t=… in {value[..Math.Min(value.Length, 24)]}…";

        if (offered.Count == 0)
            return "The signature carried no v1=… element.";

        TimeSpan drift = now - DateTimeOffset.FromUnixTimeSeconds(moment);

        if (drift.Duration() > Window)
        {
            return "The signed timestamp is outside the accepted window. "
                + "Check the sender's clock.";
        }

        string signed = $"{moment}.{body}";

        foreach (byte[] key in Keys(secret))
        {
            string expected = Convert.ToHexStringLower(
                HMACSHA256.HashData(key, Encoding.UTF8.GetBytes(signed)));

            if (offered.Any(candidate => Matches(expected, candidate.Trim()))) return null;
        }

        return "The sender's signature does not match the body. The endpoint "
            + "checked HMAC-SHA256 over \"{timestamp}.{body}\" with the sender's key.";
    }

    /// <summary>The one key, in the two forms the convention allows.</summary>
    private static IEnumerable<byte[]> Keys(string secret)
    {
        yield return Encoding.UTF8.GetBytes(secret);

        const string prefix = "whsec_";

        if (!secret.StartsWith(prefix, StringComparison.Ordinal)) yield break;

        byte[] decoded;

        try
        {
            decoded = Convert.FromBase64String(secret[prefix.Length..]);
        }
        catch (FormatException)
        {
            yield break;
        }

        yield return decoded;
    }

    /// <summary>The public half of the address, which is what the sender's URL carries.</summary>
    public static string NewToken() => Random(24);

    public static string NewSecret() => Random(32);

    /// <summary>Length-independent and content-independent comparison.</summary>
    private static bool Matches(string expected, string given)
        => CryptographicOperations.FixedTimeEquals(
            Encoding.UTF8.GetBytes(expected),
            Encoding.UTF8.GetBytes(given));

    /// <summary>URL-safe base64 with the padding dropped, so both halves survive being pasted into a query string, a shell…</summary>
    private static string Random(int bytes)
        => Convert.ToBase64String(RandomNumberGenerator.GetBytes(bytes))
            .Replace('+', '-')
            .Replace('/', '_')
            .TrimEnd('=');
}
