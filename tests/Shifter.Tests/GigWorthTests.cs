using Shifter.Application.Features.business.DTOs;
using Shifter.Application.Features.Gigs;

using Xunit;

namespace Shifter.Tests;

/// <summary>
/// What a listed shift is worth against the hours somebody already works.
///
/// A board full of rates tells nobody anything on its own: 250 an hour is
/// generous in one city and a pay cut in another, and which of those it is
/// depends entirely on who is reading.
/// </summary>
public class GigWorthTests
{
    private static LocationTotalDto Mine(double hours, decimal earned)
        => new LocationTotalDto(
            1, "Bar", "#4488CC", hours, earned, 10,
            0m, 0m, 0m, 0m, hours == 0 ? 0m : earned / (decimal)hours,
            0m, earned, 0m, string.Empty);

    [Fact]
    public void AnHourlyOfferIsComparedStraightAcross()
    {
        // Their own hour is 200; the shift offers 250.
        GigWorthDto worth = Assert.IsType<GigWorthDto>(
            GigWorth.Judge(250m, "hour", 8, [Mine(100, 20_000m)]));

        Assert.Equal(250m, worth.offered_per_hour);
        Assert.Equal(200m, worth.your_per_hour);
        Assert.Equal(25m, worth.difference_percent);
    }

    [Fact]
    public void AShiftPricedWholeIsDividedByItsOwnLength()
    {
        // 1 600 for an eight-hour shift is 200 an hour, which is exactly what
        // they already earn — so the honest answer is "the same", not "more".
        GigWorthDto worth = Assert.IsType<GigWorthDto>(
            GigWorth.Judge(1_600m, "shift", 8, [Mine(100, 20_000m)]));

        Assert.Equal(200m, worth.offered_per_hour);
        Assert.Equal(0m, worth.difference_percent);
    }

    [Fact]
    public void APayCutIsNamedAsOne()
    {
        GigWorthDto worth = Assert.IsType<GigWorthDto>(
            GigWorth.Judge(150m, "hour", 8, [Mine(100, 20_000m)]));

        Assert.Equal(-25m, worth.difference_percent);
    }

    [Fact]
    public void AShiftThatRunsPastMidnightMeasuresItsRealLength()
    {
        // 18:00 to 02:00 is eight hours, not minus sixteen.
        GigWorthDto worth = Assert.IsType<GigWorthDto>(
            GigWorth.Judge(1_600m, "shift", 8, [Mine(100, 20_000m)]));

        Assert.Equal(200m, worth.offered_per_hour);
    }

    [Fact]
    public void TooFewHoursOfTheirOwnMeansNoComparisonAtAll()
    {
        // One lucky night is not what somebody earns, and comparing against it
        // would be worse than saying nothing.
        Assert.Null(GigWorth.Judge(250m, "hour", 8, [Mine(8, 4_000m)]));
    }

    [Fact]
    public void ARateInAPeriodThatCannotBecomeAnHourIsLeftAlone()
    {
        // A monthly figure on a one-night listing has no honest hourly reading.
        Assert.Null(GigWorth.Judge(40_000m, "month", 8, [Mine(100, 20_000m)]));
    }

    [Fact]
    public void ANightWithNoRateOnItSaysNothing()
    {
        Assert.Null(GigWorth.Judge(0m, "hour", 8, [Mine(100, 20_000m)]));
    }

    [Fact]
    public void SomebodyWhoHasEarnedNothingYetIsNotDividedBy()
    {
        Assert.Null(GigWorth.Judge(250m, "hour", 8, [Mine(100, 0m)]));
    }
}
