using Shifter.Domain.Entities;

using Xunit;

namespace Shifter.Tests;

/// <summary>
/// Somebody's own tax figures, and the running total against their own stated
/// ceiling. Every test here is about the app not inventing a number.
/// </summary>
public class TaxYearTests
{
    private static TaxProfile Profile(
        decimal? percent = null,
        decimal? flat = null,
        decimal? social = null,
        decimal? limit = null,
        int year = 2026) => new()
    {
        UserId = 1,
        Name = "ФОП 2 група",
        Year = year,
        Percent = percent,
        FixedMonthly = flat,
        SocialMonthly = social,
        AnnualLimit = limit,
    };

    [Fact]
    public void WithNoRateEnteredItReportsNoTax()
    {
        // A blank profile must not produce a confident zero. Zero owed and
        // "you have not told us the rate" are different sentences.
        var reading = TaxYear.Read(Profile(), 500_000m, new DateOnly(2026, 6, 15));

        Assert.Null(reading.OnIncome);
        Assert.Null(reading.Flat);
        Assert.Null(reading.Social);
        Assert.Equal(0m, reading.Total);
    }

    [Fact]
    public void ItAppliesOnlyTheRateThePersonTyped()
    {
        var reading = TaxYear.Read(Profile(percent: 5m), 500_000m, new DateOnly(2026, 6, 15));

        Assert.Equal(25_000m, reading.OnIncome);
    }

    [Fact]
    public void FlatChargesCountTheMonthsAlreadyBegun()
    {
        // A charge for March is owed in March, not at the end of it.
        var reading = TaxYear.Read(
            Profile(flat: 1_600m, social: 1_760m), 0m, new DateOnly(2026, 3, 2));

        Assert.Equal(4_800m, reading.Flat);
        Assert.Equal(5_280m, reading.Social);
        Assert.Equal(10_080m, reading.Total);
    }

    [Fact]
    public void ALastYearProfileCountsAllTwelveMonths()
    {
        var reading = TaxYear.Read(
            Profile(flat: 1_000m, year: 2025), 0m, new DateOnly(2026, 3, 2));

        Assert.Equal(12_000m, reading.Flat);
    }

    [Fact]
    public void AYearThatHasNotStartedChargesNothing()
    {
        var reading = TaxYear.Read(
            Profile(flat: 1_000m, year: 2027), 0m, new DateOnly(2026, 3, 2));

        Assert.Equal(0m, reading.Flat);
    }

    [Fact]
    public void ItSaysNothingAboutACeilingNobodyEntered()
    {
        var reading = TaxYear.Read(Profile(percent: 5m), 900_000m, new DateOnly(2026, 6, 15));

        Assert.Null(reading.LimitUsed);
        Assert.Null(reading.LimitOn);
    }

    [Fact]
    public void ItReportsHowMuchOfTheirOwnCeilingIsGone()
    {
        var reading = TaxYear.Read(
            Profile(limit: 1_000_000m), 400_000m, new DateOnly(2026, 6, 15));

        Assert.Equal(0.4m, reading.LimitUsed);
    }

    [Fact]
    public void ItProjectsTheCrossingFromThePaceSoFar()
    {
        // Half the year at 500 000 reaches a million at the end of it.
        var reading = TaxYear.Read(
            Profile(limit: 1_000_000m), 500_000m, new DateOnly(2026, 7, 1));

        Assert.NotNull(reading.LimitOn);
        Assert.Equal(2026, reading.LimitOn!.Value.Year);
        Assert.Equal(12, reading.LimitOn.Value.Month);
    }

    [Fact]
    public void AFortnightOfJanuaryIsNotAPace()
    {
        // Two good weeks projected across twelve months is arithmetic, not a
        // forecast, and it would announce a breach to somebody who had one
        // busy fortnight.
        var reading = TaxYear.Read(
            Profile(limit: 1_000_000m), 90_000m, new DateOnly(2026, 1, 14));

        Assert.Null(reading.LimitOn);
        Assert.Equal(0.09m, reading.LimitUsed);
    }

    [Fact]
    public void ACeilingTheYearWillNotReachIsNotADate()
    {
        // "You will not reach it" is the answer. A date next March would read
        // as a threat about a year that has not started.
        var reading = TaxYear.Read(
            Profile(limit: 5_000_000m), 200_000m, new DateOnly(2026, 6, 30));

        Assert.Null(reading.LimitOn);
    }

    [Fact]
    public void ACeilingAlreadyPassedIsToday()
    {
        // Not a date in the past, which would invite somebody to think there
        // is still time before it.
        var today = new DateOnly(2026, 8, 1);
        var reading = TaxYear.Read(Profile(limit: 100_000m), 400_000m, today);

        Assert.Equal(today, reading.LimitOn);
        Assert.Equal(4m, reading.LimitUsed);
    }

    [Fact]
    public void NoIncomeMeansNoProjection()
    {
        var reading = TaxYear.Read(
            Profile(limit: 1_000_000m), 0m, new DateOnly(2026, 6, 15));

        Assert.Null(reading.LimitOn);
        Assert.Equal(0m, reading.LimitUsed);
    }
}
