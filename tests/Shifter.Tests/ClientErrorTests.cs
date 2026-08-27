using Shifter.Application.Features.Diagnostics;

using Xunit;

namespace Shifter.Tests;

/// <summary>
/// What a crash report is allowed to carry. Everything here is about what the
/// scrubber removes: a stack trace from a live page can hold an address, a
/// token, or a whole response pasted into an error message, and a log file is
/// read casually and kept in backups for months.
/// </summary>
public class ClientErrorTests
{
    [Fact]
    public void AnAddressNeverReachesTheLog()
    {
        Assert.Equal(
            "login failed for [email]",
            ClientErrorReport.Clean("login failed for anna.k+work@example.com"));
    }

    [Fact]
    public void AQueryStringIsDroppedWhole()
    {
        // Not shortened — half a token is still half a token, and the useful
        // part of a URL in a stack trace is the path, which survives.
        Assert.Equal(
            "GET /shifter/v1/days?[stripped] failed",
            ClientErrorReport.Clean("GET /shifter/v1/days?token=abc123&from=2026-01-01 failed"));
    }

    [Fact]
    public void SomethingTokenShapedIsReplacedRatherThanTruncated()
    {
        Assert.DoesNotContain(
            "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9",
            ClientErrorReport.Clean("bad token eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9"));
    }

    [Fact]
    public void ALongNumberIsNotKept()
    {
        // Card numbers and phone numbers both live here, and neither is ours.
        Assert.Equal("card [number] declined", ClientErrorReport.Clean("card 4111111111111111 declined"));
    }

    [Fact]
    public void ADocumentCannotRideInOnTheMessage()
    {
        // Prose rather than one long run of characters: an unbroken block of
        // 5 000 letters is token-shaped and gets replaced whole, which does not
        // exercise the length cap at all.
        string report = ClientErrorReport.Clean(string.Join(' ', Enumerable.Repeat("failed", 2_000)));

        Assert.Equal(ClientErrorReport.MessageMax, report.Length);
    }

    [Fact]
    public void TheFaultItselfSurvivesAllOfThat()
    {
        // The scrubbing has to leave something worth reading, or the endpoint
        // is just a rate-limited way of writing "[stripped]" to a log.
        Assert.Equal(
            "TypeError: Cannot read properties of undefined (reading 'net_earned')",
            ClientErrorReport.Clean(
                "TypeError: Cannot read properties of undefined (reading 'net_earned')"));
    }

    [Fact]
    public void OnlyThePathOfThePageIsKept()
    {
        Assert.Equal("/stats", ClientErrorReport.CleanPath("/stats?from=2026-01-01#top"));
        Assert.Equal("/", ClientErrorReport.CleanPath(null));
        Assert.Equal("/assistant", ClientErrorReport.CleanPath("assistant"));
    }

    [Fact]
    public void TheBuildIsAnIdentifierAndNothingElse()
    {
        Assert.Equal("2026.08.27-abc1234", ClientErrorReport.CleanBuild("2026.08.27-abc1234"));
        Assert.Equal("unknown", ClientErrorReport.CleanBuild(null));
        // Markup does not survive, which is the property that matters: this
        // string is printed into a log line and read in a terminal. What is
        // left of it is meaningless, and meaningless is fine.
        Assert.Equal("scriptalert1script", ClientErrorReport.CleanBuild("<script>alert(1)</script>"));
    }

    [Fact]
    public void NothingToSayIsNotSomethingToLog()
    {
        Assert.Equal(string.Empty, ClientErrorReport.Clean("   "));
    }
}
