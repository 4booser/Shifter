using System.Security.Cryptography;

namespace Shifter.Application.Features.Auth.Services;

/// <summary>
/// RFC 6238 time-based one-time passwords, SHA-1/6-digit/30-second — the
/// dialect every authenticator app speaks. Hand-rolled because the whole
/// algorithm is smaller than a package reference, and pinned by the RFC's
/// own test vectors in the suite.
/// </summary>
public static class Totp
{
    private const string Base32Alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
    private const int Digits = 6;
    private const int StepSeconds = 30;

    public static string GenerateSecret()
        => ToBase32(RandomNumberGenerator.GetBytes(20));

    /// <summary>The uri an authenticator turns into an account entry.</summary>
    public static string OtpauthUrl(string secret, string account)
        => $"otpauth://totp/Shifter:{Uri.EscapeDataString(account)}?secret={secret}&issuer=Shifter&algorithm=SHA1&digits=6&period=30";

    /// <summary>Accepts the neighbouring steps too: clocks drift, thumbs lag.</summary>
    public static bool Verify(string secret, string code, DateTimeOffset? at = null)
    {
        if (code.Length != Digits || !code.All(char.IsAsciiDigit)) return false;

        var moment = at ?? DateTimeOffset.UtcNow;
        var step = moment.ToUnixTimeSeconds() / StepSeconds;

        for (long drift = -1; drift <= 1; drift += 1)
        {
            if (Compute(secret, step + drift) == code) return true;
        }

        return false;
    }

    public static string Compute(string secret, long step)
    {
        var key = FromBase32(secret);
        var counter = new byte[8];

        for (var index = 7; index >= 0; index -= 1)
        {
            counter[index] = (byte)(step & 0xff);
            step >>= 8;
        }

        using var hmac = new HMACSHA1(key);
        var hash = hmac.ComputeHash(counter);

        // Dynamic truncation, straight from RFC 4226 §5.3.
        var offset = hash[^1] & 0x0f;
        var binary =
            ((hash[offset] & 0x7f) << 24)
            | (hash[offset + 1] << 16)
            | (hash[offset + 2] << 8)
            | hash[offset + 3];

        return (binary % 1_000_000).ToString("D6");
    }

    public static string ToBase32(byte[] data)
    {
        var output = new System.Text.StringBuilder((data.Length * 8 + 4) / 5);
        var buffer = 0;
        var bits = 0;

        foreach (var b in data)
        {
            buffer = (buffer << 8) | b;
            bits += 8;

            while (bits >= 5)
            {
                bits -= 5;
                output.Append(Base32Alphabet[(buffer >> bits) & 0x1f]);
            }
        }

        if (bits > 0) output.Append(Base32Alphabet[(buffer << (5 - bits)) & 0x1f]);

        return output.ToString();
    }

    public static byte[] FromBase32(string encoded)
    {
        var cleaned = encoded.TrimEnd('=').ToUpperInvariant();
        var output = new List<byte>(cleaned.Length * 5 / 8);
        var buffer = 0;
        var bits = 0;

        foreach (var character in cleaned)
        {
            var value = Base32Alphabet.IndexOf(character);

            if (value < 0) throw new FormatException("Not base32.");

            buffer = (buffer << 5) | value;
            bits += 5;

            if (bits >= 8)
            {
                bits -= 8;
                output.Add((byte)((buffer >> bits) & 0xff));
            }
        }

        return [.. output];
    }
}
