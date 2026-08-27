using Shifter.Application.Features.Teams.Services;
using Shifter.Domain.Entities;

using Xunit;

namespace Shifter.Tests;

/// <summary>
/// Time off. Not the same thing as blocking a day: blocking says "I cannot work
/// Tuesday" and obliges nobody, while a leave request covers a stretch and needs
/// an answer — an unanswered one is a cancelled flight.
/// </summary>
public class LeaveTests
{
    private static LeaveRequest Asked(string from, string to, LeaveStatus status = LeaveStatus.Pending)
        => new LeaveRequest
        {
            TeamId = 1,
            UserId = 5,
            From = DateOnly.Parse(from),
            To = DateOnly.Parse(to),
            Status = status,
        };

    [Fact]
    public void TwoRequestsOverTheSameFortnightAreOneRequest()
    {
        LeaveRequest existing = Asked("2026-07-06", "2026-07-19");

        Assert.True(LeaveRules.Overlaps(existing, DateOnly.Parse("2026-07-01"), DateOnly.Parse("2026-07-07")));
        Assert.True(LeaveRules.Overlaps(existing, DateOnly.Parse("2026-07-19"), DateOnly.Parse("2026-07-25")));
        Assert.True(LeaveRules.Overlaps(existing, DateOnly.Parse("2026-07-10"), DateOnly.Parse("2026-07-11")));
    }

    [Fact]
    public void JulyAndSeptemberAreTwoDifferentAsks()
    {
        LeaveRequest existing = Asked("2026-07-06", "2026-07-19");

        Assert.False(LeaveRules.Overlaps(existing, DateOnly.Parse("2026-09-01"), DateOnly.Parse("2026-09-14")));
        // Touching ends, not overlapping: the 20th is free.
        Assert.False(LeaveRules.Overlaps(existing, DateOnly.Parse("2026-07-20"), DateOnly.Parse("2026-07-25")));
    }

    [Fact]
    public void OnlyAnAnsweredRequestKeepsSomebodyOffTheRota()
    {
        // Planning around a question is how people end up with neither the
        // shift nor the holiday.
        DateOnly middle = DateOnly.Parse("2026-07-10");

        Assert.False(LeaveRules.Blocks(Asked("2026-07-06", "2026-07-19"), middle));
        Assert.True(LeaveRules.Blocks(Asked("2026-07-06", "2026-07-19", LeaveStatus.Approved), middle));
        Assert.False(LeaveRules.Blocks(Asked("2026-07-06", "2026-07-19", LeaveStatus.Declined), middle));
    }

    [Fact]
    public void ApprovedLeaveBlocksItsOwnEdges()
    {
        LeaveRequest approved = Asked("2026-07-06", "2026-07-19", LeaveStatus.Approved);

        Assert.True(LeaveRules.Blocks(approved, DateOnly.Parse("2026-07-06")));
        Assert.True(LeaveRules.Blocks(approved, DateOnly.Parse("2026-07-19")));
        Assert.False(LeaveRules.Blocks(approved, DateOnly.Parse("2026-07-05")));
        Assert.False(LeaveRules.Blocks(approved, DateOnly.Parse("2026-07-20")));
    }

    [Fact]
    public void ADayIsCountedAtBothEnds()
    {
        // One day off is one day, not zero. Fence posts decide whether somebody
        // gets the Friday they asked for.
        Assert.Equal(1, Asked("2026-07-06", "2026-07-06").Days);
        Assert.Equal(14, Asked("2026-07-06", "2026-07-19").Days);
    }

    [Fact]
    public void AHolidayUsuallyComesWithNoExplanationAtAll()
    {
        // Demanding one would only teach people to type a full stop.
        Assert.Null(LeaveRules.CleanReason(null));
        Assert.Null(LeaveRules.CleanReason("   "));
        Assert.Equal("свадьба", LeaveRules.CleanReason("  свадьба "));
    }

    [Fact]
    public void AnEssayIsTruncatedRatherThanRefused()
    {
        string reason = LeaveRules.CleanReason(new string('я', 500))!;

        Assert.Equal(LeaveRequest.ReasonMax, reason.Length);
    }
}
