using Shifter.Domain.Entities;

using Xunit;

namespace Shifter.Tests;

/// <summary>
/// The board asks people for a phone number and then goes quiet about where
/// it went. These are the rules for the answer it gives back.
/// </summary>
public class ContactAuditTests
{
    private static readonly DateTime Now = new(2026, 3, 14, 20, 0, 0, DateTimeKind.Utc);

    private static GigResponse Reply(
        DateTime? opened, string? phone, DateTime? lastSeen) => new()
    {
        ListingId = 1,
        UserId = 2,
        OpenedAt = opened,
        Phone = phone,
        ContactSeenLastAt = lastSeen,
    };

    [Fact]
    public void AReplyThatSharedNothingHasNothingToAccountFor()
    {
        // A "nobody looked" line about a number nobody gave is noise dressed
        // as a privacy feature.
        Assert.False(Reply(null, null, null).IsNewLook(Now));
    }

    [Fact]
    public void ContactsHeldBackAreNotWatched()
    {
        // The person typed a number and then chose to keep it back. It never
        // left, so nobody can have looked at it.
        Assert.False(Reply(null, "+380...", null).IsNewLook(Now));
    }

    [Fact]
    public void TheFirstLookCounts()
    {
        Assert.True(Reply(Now.AddDays(-1), "+380...", null).IsNewLook(Now));
    }

    [Fact]
    public void ATabLeftOpenAllEveningIsOneLook()
    {
        // Counting refreshes would turn an honest log into an accusation, and
        // the person reading it cannot tell the two apart.
        Assert.False(Reply(Now.AddDays(-1), "+380...", Now.AddMinutes(-3)).IsNewLook(Now));
        Assert.False(Reply(Now.AddDays(-1), "+380...", Now.AddMinutes(-14)).IsNewLook(Now));
    }

    [Fact]
    public void ComingBackLaterIsItsOwnVisit()
    {
        // Which is the thing actually worth knowing: somebody went and looked
        // your number up again after the shift.
        Assert.True(Reply(Now.AddDays(-1), "+380...", Now.AddMinutes(-16)).IsNewLook(Now));
        Assert.True(Reply(Now.AddDays(-1), "+380...", Now.AddDays(-2)).IsNewLook(Now));
    }

    [Fact]
    public void ATelegramHandleIsAContactToo()
    {
        var reply = Reply(Now.AddDays(-1), null, null);

        reply.Telegram = "@somebody";

        Assert.True(reply.IsNewLook(Now));
    }
}
