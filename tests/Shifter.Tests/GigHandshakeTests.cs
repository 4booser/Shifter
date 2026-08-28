using System.Text.RegularExpressions;
using Shifter.Domain.Entities;

using Xunit;

namespace Shifter.Tests;

/// <summary>
/// "Я выйду" hands the phone over with the first word, which is right for
/// somebody who has decided and far too much for somebody still looking.
/// The quiet answer holds the contacts back until both sides have said yes.
///
/// The rule that matters is one sentence long — a contact is visible only
/// once its owner opened it — and it is exactly the kind that gets broken by
/// a new screen written six months later, so half of what is below reads the
/// service's own source rather than its behaviour.
/// </summary>
public class GigHandshakeTests
{
    private static GigResponse Reply(bool quiet) => new()
    {
        ListingId = 1,
        UserId = 2,
        Phone = quiet ? null : "+380501112233",
        Telegram = quiet ? null : "@somebody",
        OpenedAt = quiet ? null : DateTime.UtcNow,
    };

    [Fact]
    public void A_quiet_reply_shows_no_contact_before_anybody_agrees()
    {
        var reply = Reply(quiet: true);

        Assert.Equal("quiet", reply.Stage);
        Assert.Null(reply.SharedPhone);
        Assert.Null(reply.SharedTelegram);
    }

    [Fact]
    public void Somebody_who_decided_is_reachable_immediately_as_before()
    {
        var reply = Reply(quiet: false);

        Assert.Equal("direct", reply.Stage);
        Assert.Equal("+380501112233", reply.SharedPhone);
    }

    [Fact]
    public void The_venue_saying_yes_is_not_by_itself_a_phone_number()
    {
        // The half-way state, and the one worth a test of its own: the venue
        // has picked somebody and still cannot call them.
        var reply = Reply(quiet: true);
        reply.AcceptedAt = DateTime.UtcNow;

        Assert.Equal("invited", reply.Stage);
        Assert.Null(reply.SharedPhone);
        Assert.Null(reply.SharedTelegram);
    }

    [Fact]
    public void Both_yesses_open_the_contacts()
    {
        var reply = Reply(quiet: true);
        reply.AcceptedAt = DateTime.UtcNow;
        reply.Phone = "+380501112233";
        reply.OpenedAt = DateTime.UtcNow;

        Assert.Equal("open", reply.Stage);
        Assert.Equal("+380501112233", reply.SharedPhone);
    }

    [Fact]
    public void A_stored_contact_stays_hidden_while_the_flag_says_it_should()
    {
        // Belt and braces: the fields are only ever written together with the
        // timestamp, and the property still refuses to show one without it.
        var reply = new GigResponse
        {
            ListingId = 1,
            UserId = 2,
            Phone = "+380501112233",
            Telegram = "@somebody",
            OpenedAt = null,
        };

        Assert.Null(reply.SharedPhone);
        Assert.Null(reply.SharedTelegram);
    }

    /// <summary>The service, as text. Tests run from bin/, the source is up the tree.</summary>
    private static string Source(string relative)
    {
        var directory = new DirectoryInfo(AppContext.BaseDirectory);

        while (directory is not null && !File.Exists(Path.Combine(directory.FullName, "Shifter.sln")))
            directory = directory.Parent;

        Assert.NotNull(directory);

        return File.ReadAllText(Path.Combine(directory!.FullName, relative));
    }

    [Fact]
    public void No_reply_reaches_a_screen_carrying_a_contact_it_did_not_open()
    {
        var source = Source("server/src/Application/Features/Gigs/GigService.cs");

        // reply.Phone and reply.Telegram are the raw fields. Reading one to
        // put it in a response is the whole bug this task exists to prevent,
        // so the service may only write them — every read goes through
        // SharedPhone and SharedTelegram, which check the timestamp.
        var raw = Regex.Matches(source, @"\breply\.(Phone|Telegram)\b(?!\s*=[^=])")
            .Select(match => match.Value)
            .ToArray();

        Assert.Empty(raw);
    }

    [Fact]
    public void The_owners_view_of_a_reply_is_built_in_exactly_one_place()
    {
        var source = Source("server/src/Application/Features/Gigs/GigService.cs");

        // A second constructor call is a second chance to pass the wrong
        // field. There is one, inside Seen.
        Assert.Single(Regex.Matches(source, @"new GigResponseDto\("));
    }

    [Fact]
    public void The_venues_own_contacts_wait_for_it_to_pick_somebody()
    {
        var source = Source("server/src/Application/Features/Gigs/GigService.cs");

        // Symmetry, and the same rule read the other way round: VenuePhone
        // leaves the server only behind a check on AcceptedAt.
        foreach (Match use in Regex.Matches(source, @".{80}mine\.Venue(Phone|Telegram)"))
            Assert.Contains("mine.AcceptedAt is null", use.Value);
    }
}
