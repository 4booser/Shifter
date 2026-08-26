using System.Text;

using Shifter.Application.Features.Auth.Services;

using Xunit;

namespace Shifter.Tests;

public class TotpTests
{
    /// <summary>The RFC 6238 appendix secret, "12345678901234567890".</summary>
    private static readonly string RfcSecret =
        Totp.ToBase32(Encoding.ASCII.GetBytes("12345678901234567890"));

    // The SHA-1 rows of the RFC 6238 Appendix B table, truncated to the six
    // digits every authenticator shows (the table prints eight).
    [Theory]
    [InlineData(59L, "287082")]
    [InlineData(1111111109L, "081804")]
    [InlineData(1111111111L, "050471")]
    [InlineData(1234567890L, "005924")]
    [InlineData(2000000000L, "279037")]
    [InlineData(20000000000L, "353130")]
    public void MatchesTheRfcVectors(long unixSeconds, string expected)
        => Assert.Equal(expected, Totp.Compute(RfcSecret, unixSeconds / 30));

    [Fact]
    public void VerifyAcceptsTheNeighbouringStep()
    {
        var at = DateTimeOffset.FromUnixTimeSeconds(59);
        var previous = Totp.Compute(RfcSecret, 59 / 30 - 1);

        Assert.True(Totp.Verify(RfcSecret, previous, at));
    }

    [Fact]
    public void VerifyRefusesGarbageWithoutThrowing()
    {
        Assert.False(Totp.Verify(RfcSecret, "12345", DateTimeOffset.UnixEpoch));
        Assert.False(Totp.Verify(RfcSecret, "abcdef", DateTimeOffset.UnixEpoch));
        Assert.False(Totp.Verify(RfcSecret, "000000", DateTimeOffset.FromUnixTimeSeconds(59)));
    }

    [Fact]
    public void Base32RoundTrips()
    {
        var data = new byte[] { 0, 1, 2, 250, 251, 252, 253, 254, 255 };

        Assert.Equal(data, Totp.FromBase32(Totp.ToBase32(data)));
    }
}
