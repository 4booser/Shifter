using Shifter.Domain.Entities;

using Xunit;

namespace Shifter.Tests;

public class PayPeriodCalculatorTests
{
    private static Location Place(PayPeriod period, int payDay = 1, string anchor = "2020-01-06")
        => new Location
        {
            Id = 1,
            UserId = Build.UserId,
            Name = "Bar",
            PayPeriod = period,
            PayDay = payDay,
            PayAnchor = DateOnly.Parse(anchor),
        };

    [Fact]
    public void MonthlyOnTheFirstIsAPlainCalendarMonth()
    {
        var (from, to) = PayPeriodCalculator.PeriodFor(
            Place(PayPeriod.Monthly), new DateOnly(2026, 3, 17));

        Assert.Equal(new DateOnly(2026, 3, 1), from);
        Assert.Equal(new DateOnly(2026, 3, 31), to);
    }

    [Fact]
    public void MonthlyOnTheTenthRunsToTheNinthOfTheNextMonth()
    {
        var (from, to) = PayPeriodCalculator.PeriodFor(
            Place(PayPeriod.Monthly, payDay: 10), new DateOnly(2026, 3, 17));

        Assert.Equal(new DateOnly(2026, 3, 10), from);
        Assert.Equal(new DateOnly(2026, 4, 9), to);
    }

    [Fact]
    public void ADateBeforeThePayDayBelongsToThePreviousWindow()
    {
        var (from, to) = PayPeriodCalculator.PeriodFor(
            Place(PayPeriod.Monthly, payDay: 10), new DateOnly(2026, 3, 4));

        Assert.Equal(new DateOnly(2026, 2, 10), from);
        Assert.Equal(new DateOnly(2026, 3, 9), to);
    }

    [Fact]
    public void MonthlyCrossesTheYearBoundary()
    {
        var (from, to) = PayPeriodCalculator.PeriodFor(
            Place(PayPeriod.Monthly, payDay: 15), new DateOnly(2026, 1, 3));

        Assert.Equal(new DateOnly(2025, 12, 15), from);
        Assert.Equal(new DateOnly(2026, 1, 14), to);
    }

    [Theory]
    [InlineData("2026-03-01", "2026-03-01", "2026-03-15")]
    [InlineData("2026-03-15", "2026-03-01", "2026-03-15")]
    [InlineData("2026-03-16", "2026-03-16", "2026-03-31")]
    [InlineData("2026-02-28", "2026-02-16", "2026-02-28")]
    public void SemiMonthlySplitsOnTheFifteenth(string date, string expectedFrom, string expectedTo)
    {
        var (from, to) = PayPeriodCalculator.PeriodFor(
            Place(PayPeriod.SemiMonthly), DateOnly.Parse(date));

        Assert.Equal(DateOnly.Parse(expectedFrom), from);
        Assert.Equal(DateOnly.Parse(expectedTo), to);
    }

    [Fact]
    public void BiWeeklyCountsFourteenDayCyclesFromTheAnchor()
    {
        var (from, to) = PayPeriodCalculator.PeriodFor(
            Place(PayPeriod.BiWeekly, anchor: "2026-01-05"), new DateOnly(2026, 1, 20));

        Assert.Equal(new DateOnly(2026, 1, 19), from);
        Assert.Equal(new DateOnly(2026, 2, 1), to);
    }

    /// <summary>
    /// The floor division exists for exactly this case: a plain remainder goes
    /// negative before the anchor and lands the date in the wrong window.
    /// </summary>
    [Fact]
    public void ADateBeforeTheAnchorStaysOnItsOwnSideOfTheBoundary()
    {
        var (from, to) = PayPeriodCalculator.PeriodFor(
            Place(PayPeriod.BiWeekly, anchor: "2026-01-05"), new DateOnly(2025, 12, 30));

        Assert.Equal(new DateOnly(2025, 12, 22), from);
        Assert.Equal(new DateOnly(2026, 1, 4), to);
        Assert.True(to < new DateOnly(2026, 1, 5));
    }

    [Fact]
    public void TheAnchorItselfOpensItsOwnPeriod()
    {
        var (from, _) = PayPeriodCalculator.PeriodFor(
            Place(PayPeriod.Weekly, anchor: "2026-01-05"), new DateOnly(2026, 1, 5));

        Assert.Equal(new DateOnly(2026, 1, 5), from);
    }

    [Fact]
    public void WeeklyRunsSevenDays()
    {
        var (from, to) = PayPeriodCalculator.PeriodFor(
            Place(PayPeriod.Weekly, anchor: "2026-01-05"), new DateOnly(2026, 1, 14));

        Assert.Equal(new DateOnly(2026, 1, 12), from);
        Assert.Equal(new DateOnly(2026, 1, 18), to);
    }

    [Fact]
    public void APayDayPastTheShortestMonthIsClamped()
    {
        // The 31st would throw in February, so the calculator clamps to 28.
        var (from, _) = PayPeriodCalculator.PeriodFor(
            Place(PayPeriod.Monthly, payDay: 31), new DateOnly(2026, 2, 28));

        Assert.Equal(new DateOnly(2026, 2, 28), from);
    }

    [Fact]
    public void CommissionFollowsTheWageWhenItHasNoScheduleOfItsOwn()
    {
        Location place = Place(PayPeriod.SemiMonthly);

        Assert.False(PayPeriodCalculator.SplitsSales(place));
        Assert.Equal(
            PayPeriodCalculator.PeriodFor(place, new DateOnly(2026, 3, 17)),
            PayPeriodCalculator.SalesPeriodFor(place, new DateOnly(2026, 3, 17)));
    }

    [Fact]
    public void CommissionCanSettleMonthlyWhileTheWageArrivesTwice()
    {
        // The arrangement this was built for: the rate twice a month, the
        // percentage once.
        Location place = Place(PayPeriod.SemiMonthly);
        place.SalesPayPeriod = PayPeriod.Monthly;
        place.SalesPayDay = 1;

        Assert.True(PayPeriodCalculator.SplitsSales(place));

        var (wageFrom, wageTo) = PayPeriodCalculator.PeriodFor(place, new DateOnly(2026, 3, 17));
        var (salesFrom, salesTo) = PayPeriodCalculator.SalesPeriodFor(place, new DateOnly(2026, 3, 17));

        Assert.Equal(new DateOnly(2026, 3, 16), wageFrom);
        Assert.Equal(new DateOnly(2026, 3, 31), wageTo);

        Assert.Equal(new DateOnly(2026, 3, 1), salesFrom);
        Assert.Equal(new DateOnly(2026, 3, 31), salesTo);
    }

    [Fact]
    public void AMatchingSecondScheduleIsNotASplit()
    {
        // Set, but to the same cycle: there is one payment, not two, and the
        // reconciliation must not invent a second row for it.
        Location place = Place(PayPeriod.Monthly, payDay: 10);
        place.SalesPayPeriod = PayPeriod.Monthly;
        place.SalesPayDay = 10;
        place.SalesPayAnchor = place.PayAnchor;

        Assert.False(PayPeriodCalculator.SplitsSales(place));
    }
}
