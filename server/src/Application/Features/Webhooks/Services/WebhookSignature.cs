using System.Security.Cryptography;
using System.Text;

namespace Shifter.Application.Features.Webhooks.Services;

/// <summary>
/// Who is allowed to write to an endpoint. The caller holds no account and
/// presents no token of ours, so the whole of the decision is this: does it
/// know the endpoint's secret.
///
/// Two ways to show that, because senders differ in what they can be made to
/// do. The good one is an HMAC over the timestamp and the body, which proves
/// knowledge of the secret without putting it on the wire and cannot be
/// replayed past the window. The plain one is the secret in a header, for the
/// till software that offers a box for a URL and nothing else — weaker, but the
/// alternative is that person having nothing at all.
/// </summary>
public static class WebhookSignature
{
    public const string SignatureHeader = "X-Shifter-Signature";
    public const string TimestampHeader = "X-Shifter-Timestamp";
    public const string SecretHeader = "X-Shifter-Secret";

    /// <summary>
    /// How stale a signed request may be. Wide enough for a sender whose clock
    /// drifts a few minutes, narrow enough that a captured body is worthless by
    /// the time anyone finds it.
    /// </summary>
    public static readonly TimeSpan Window = TimeSpan.FromMinutes(5);

    /// <summary>
    /// The value the sender puts in the signature header. The timestamp is
    /// inside the signed string, not merely alongside it: signing the body
    /// alone would let a captured request be replayed with a fresh one.
    /// </summary>
    public static string Compute(string secret, string timestamp, string body)
    {
        byte[] hash = HMACSHA256.HashData(
            Encoding.UTF8.GetBytes(secret),
            Encoding.UTF8.GetBytes($"{timestamp}.{body}"));

        return "sha256=" + Convert.ToHexStringLower(hash);
    }

    /// <summary>
    /// Null when the request may be accepted, otherwise the reason it may not,
    /// in words meant for whoever is configuring the sender.
    /// </summary>
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

    /// <summary>The public half of the address, which is what the sender's URL carries.</summary>
    public static string NewToken() => Random(24);

    public static string NewSecret() => Random(32);

    /// <summary>
    /// Length-independent and content-independent comparison. A plain string
    /// equality returns early on the first differing byte, and the timing of
    /// that is enough to recover a secret one character at a time.
    /// </summary>
    private static bool Matches(string expected, string given)
        => CryptographicOperations.FixedTimeEquals(
            Encoding.UTF8.GetBytes(expected),
            Encoding.UTF8.GetBytes(given));

    /// <summary>
    /// URL-safe base64 with the padding dropped, so both halves survive being
    /// pasted into a query string, a shell, or a field that trims '='.
    /// </summary>
    private static string Random(int bytes)
        => Convert.ToBase64String(RandomNumberGenerator.GetBytes(bytes))
            .Replace('+', '-')
            .Replace('/', '_')
            .TrimEnd('=');
}
