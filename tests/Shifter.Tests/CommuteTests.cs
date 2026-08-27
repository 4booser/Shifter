using Shifter.Application.Features.business.DTOs;
using Shifter.Application.Features.business.Services;
using Shifter.Domain.Entities;

using Xunit;

namespace Shifter.Tests;

/// <summary>
/// An hour at the bar round the corner and an hour at the bar forty minutes
/// away are not the same hour, and everybody knows it without ever having
/// counted it. This is the counting.
/// </summary>
public class CommuteTests
{
    private static LocationTotalDto Total(double hours = 40, decimal net = 8_000m, int days = 5)
        => new LocationTotalDto(
            1, "Bar", "#4488CC", hours, net, days,
            0m, 0m, 0m, 0m,
            hours == 0 ? 0m : net / (decimal)hours,
            0m, net, 0m, string.Empty);

    private static Location Place(int minutes, decimal cost)
        => new Location
        {
            Id = 1,
            UserId = Build.UserId,
            Name = "Bar",
            Colour = "#4488CC",
            CommuteMinutes = minutes,
            CommuteCost = cost,
        };

    [Fact]
    public void ADistantPlacePaysLessPerHourThanItLooks()
    {
        // Five days, forty minutes each way: 6h40m of travelling on top of 40
        // worked, and ten fares of 50.
        CommuteDto commute = Assert.IsType<CommuteDto>(CommuteMath.For(Place(40, 50m), Total()));

        Assert.Equal(6.67, commute.travel_hours, 2);
        Assert.Equal(500m, commute.fares);
        Assert.Equal(46.67, commute.hours_with_travel, 2);
        Assert.Equal(7_500m, commute.net_after_fares);
        // 200 an hour on paper; 160 once the journey is part of the job.
        Assert.Equal(160.71m, commute.per_hour_with_travel);
    }

    [Fact]
    public void NobodySayingHowFarItIsIsNotAJourneyOfZero()
    {
        // Printing "the same" for a place whose journey is simply unknown
        // would be the app inventing a comparison.
        Assert.Null(CommuteMath.For(Place(0, 0m), Total()));
    }

    [Fact]
    public void AFreeWalkStillCountsItsMinutes()
    {
        // Cycling costs nothing and still takes twenty minutes each way, which
        // is the whole point of keeping time and money apart.
        CommuteDto commute = Assert.IsType<CommuteDto>(CommuteMath.For(Place(20, 0m), Total()));

        Assert.Equal(0m, commute.fares);
        Assert.Equal(43.33, commute.hours_with_travel, 2);
    }

    [Fact]
    public void AFareWithNoJourneyTimeIsStillCounted()
    {
        CommuteDto commute = Assert.IsType<CommuteDto>(CommuteMath.For(Place(0, 120m), Total()));

        Assert.Equal(1_200m, commute.fares);
        Assert.Equal(40, commute.hours_with_travel, 2);
    }

    [Fact]
    public void APlaceNobodyWorkedHasNoJourneyToCount()
    {
        Assert.Null(CommuteMath.For(Place(40, 50m), Total(hours: 0, net: 0m, days: 0)));
    }

    [Fact]
    public void TheJourneyIsCountedOncePerDayNotOncePerShift()
    {
        // A split shift at the same restaurant is one journey there and one
        // back. Counting it twice would flatter every other place.
        CommuteDto once = Assert.IsType<CommuteDto>(
            CommuteMath.For(Place(30, 40m), Total(hours: 40, net: 8_000m, days: 5)));

        Assert.Equal(400m, once.fares);
        Assert.Equal(5, once.travel_hours, 2);
    }
}
