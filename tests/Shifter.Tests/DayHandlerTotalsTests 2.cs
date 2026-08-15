using Shifter.Application.Features.business.DTOs;
using Shifter.Application.Features.business.Services;
using Shifter.Domain.Entities;

using Xunit;

namespace Shifter.Tests;

/// <summary>
/// Everything the range summary adds up: period wages, tips, sales, tip-out,
/// meals and how they are split between places.
/// </summary>
public class DayHandlerTotalsTests
{
    private readonly FakeShifterQuery _query = new();
    private readonly DayHandler _handler;

    public DayHandlerTotalsTests()
    {
        _handler = new DayHandler(new FakeShifterCommand(), _query);
    }

    private Task<DaysDto> Range(string from = "2026-03-01", string to = "2026-03-31")
        => _handler.ListAsync(
            Build.UserId, DateOnly.Parse(from), DateOnly.Parse(to), CancellationToken.None);

    // ==== Period wages ====

    [Fact]
    public async Task AMonthlyWageIsCountedOnceHoweverManyShifts()
    {
        Shift template = Build.Template(1, period: SalaryPeriod.Month, amount: 40000m);

        for (int index = 0; index < 20; index += 1)
        {
            _query.Days.Add(Build.WorkedDay(
                DateOnly.Parse("2026-03-02").AddDays(index).ToString("yyyy-MM-dd"), template));
        }

        DaysDto result = await Range();

        Assert.Equal(40000m, result.period_earned);
        Assert.Equal(0m, result.shifts_earned);
        Assert.Equal(40000m, result.total_earned);
    }

    [Fact]
    public async Task AWeeklyWageIsCountedOncePerIsoWeek()
    {
        Shift template = Build.Template(1, period: SalaryPeriod.Week, amount: 10000m);

        // Two days in the week of the 2nd, two in the week of the 9th.
        foreach (string date in new[] { "2026-03-02", "2026-03-04", "2026-03-09", "2026-03-11" })
        {
            _query.Days.Add(Build.WorkedDay(date, template));
        }

        DaysDto result = await Range();

        Assert.Equal(20000m, result.period_earned);
    }

    [Fact]
    public async Task AMonthlyWageSpanningTwoMonthsIsCountedTwice()
    {
        Shift template = Build.Template(1, period: SalaryPeriod.Month, amount: 40000m);

        _query.Days.Add(Build.WorkedDay("2026-03-20", template));
        _query.Days.Add(Build.WorkedDay("2026-04-03", template));

        DaysDto result = await Range("2026-03-01", "2026-04-30");

        Assert.Equal(80000m, result.period_earned);
    }

    [Fact]
    public async Task APlannedSalariedMonthLandsInPlannedNotEarned()
    {
        Shift template = Build.Template(1, period: SalaryPeriod.Month, amount: 40000m);

        _query.Days.Add(Build.WorkedDay("2026-03-20", template, worked: false));

        DaysDto result = await Range();

        Assert.Equal(0m, result.period_earned);
        Assert.Equal(40000m, result.planned_earned);
    }

    // ==== Sales ====

    [Fact]
    public async Task SalesEarnTheirPercentageOfThePrice()
    {
        Shift template = Build.Template(1, amount: 0m);

        _query.Days.Add(Build.WorkedDay(
            "2026-03-02", template, sales: [Build.Sale(1, quantity: 10, price: 200m, percentage: 7.5m)]));

        DaysDto result = await Range();

        // 10 * 200 * 7.5%.
        Assert.Equal(150m, result.sales_earned);
        Assert.Equal(150m, result.total_earned);
    }

    [Fact]
    public async Task SalesAppearOnTheDayAsWellAsTheTotal()
    {
        Shift template = Build.Template(1, amount: 0m);

        _query.Days.Add(Build.WorkedDay(
            "2026-03-02", template, sales: [Build.Sale(1, 4, 500m, 10m)]));

        DaysDto result = await Range();

        DayDto day = Assert.Single(result.days);

        Assert.Equal(200m, day.sales.Sum(entry => entry.earned));
        Assert.Equal(200m, result.sales_earned);
    }

    // ==== Tips, tip-out and deductions ====

    [Fact]
    public async Task TipOutTakesItsCutOfTipsAndSales()
    {
        Location place = Build.Place(1, tipOutOfTips: 10m, tipOutOfSales: 2m);

        _query.Locations.Add(place);

        Shift template = Build.Template(1, location: place, amount: 0m);

        _query.Days.Add(Build.WorkedDay(
            "2026-03-02",
            template,
            tips: 1000m,
            sales: [Build.Sale(1, quantity: 10, price: 500m, percentage: 0m)]));

        DaysDto result = await Range();

        // 10% of 1000 in tips, plus 2% of the 5000 rung up.
        Assert.Equal(200m, result.tip_out);
        Assert.Equal(1000m - 200m, result.total_earned);
    }

    [Fact]
    public async Task ADayWithNoPlaceTipsOutNothing()
    {
        Shift template = Build.Template(1, amount: 0m);

        _query.Days.Add(Build.WorkedDay("2026-03-02", template, tips: 1000m));

        DaysDto result = await Range();

        Assert.Equal(0m, result.tip_out);
        Assert.Equal(1000m, result.total_earned);
    }

    [Fact]
    public async Task TheMealIsWithheldOncePerPlacePerDay()
    {
        Location place = Build.Place(1, meal: 150m);

        _query.Locations.Add(place);

        Shift morning = Build.Template(1, location: place, amount: 0m, start: "08:00", end: "12:00");
        Shift evening = Build.Template(2, location: place, amount: 0m, start: "18:00", end: "22:00");

        // A split shift at the same restaurant is still one sitting.
        _query.Days.Add(new Day
        {
            UserId = Build.UserId,
            Date = DateOnly.Parse("2026-03-02"),
            Shifts = [DayShift.From(morning, true), DayShift.From(evening, true)],
        });

        DaysDto result = await Range();

        Assert.Equal(150m, result.deductions);
    }

    [Fact]
    public async Task FinesAddToTheMeal()
    {
        Location place = Build.Place(1, meal: 150m);

        _query.Locations.Add(place);

        _query.Days.Add(Build.WorkedDay(
            "2026-03-02", Build.Template(1, location: place, amount: 1000m), deductions: 500m));

        DaysDto result = await Range();

        Assert.Equal(650m, result.deductions);
    }

    [Fact]
    public async Task TheDayAndTheRangeAgreeOnWhatWasEarned()
    {
        Location place = Build.Place(1, tipOutOfTips: 10m, meal: 100m);

        _query.Locations.Add(place);

        _query.Days.Add(Build.WorkedDay(
            "2026-03-02",
            Build.Template(1, location: place, amount: 100m),
            tips: 1000m,
            sales: [Build.Sale(1, 2, 500m, 10m)]));

        DaysDto result = await Range();

        DayDto day = Assert.Single(result.days);

        Assert.Equal(result.total_earned, day.earned);
    }

    // ==== Splitting a day between two places ====

    [Fact]
    public async Task TipsAndSalesAreSharedByTheHoursEachPlaceGot()
    {
        Location bar = Build.Place(1, "Bar");
        Location cafe = Build.Place(2, "Cafe");

        _query.Locations.Add(bar);
        _query.Locations.Add(cafe);

        Shift atBar = Build.Template(1, location: bar, amount: 0m, start: "08:00", end: "14:00");
        Shift atCafe = Build.Template(2, location: cafe, amount: 0m, start: "14:00", end: "16:00");

        // Six hours at the bar, two at the cafe: a 3:1 split of the day's tips.
        _query.Days.Add(new Day
        {
            UserId = Build.UserId,
            Date = DateOnly.Parse("2026-03-02"),
            Shifts = [DayShift.From(atBar, true), DayShift.From(atCafe, true)],
            Tips = 800m,
        });

        DaysDto result = await Range();

        LocationTotalDto barTotal = result.by_location.Single(total => total.name == "Bar");
        LocationTotalDto cafeTotal = result.by_location.Single(total => total.name == "Cafe");

        Assert.Equal(600m, barTotal.tips);
        Assert.Equal(200m, cafeTotal.tips);
        Assert.Equal(6, barTotal.hours);
        Assert.Equal(2, cafeTotal.hours);
    }

    /// <summary>
    /// Two days at the same place must land in one bucket. They used to be
    /// grouped by the Location object, and a no-tracking read hands back a new
    /// instance per day, so the same bar appeared twice.
    /// </summary>
    [Fact]
    public async Task TheSamePlaceOnTwoDaysIsOneRow()
    {
        Location bar = Build.Place(1, "Bar");

        _query.Locations.Add(bar);

        // Separate Location instances with the same id, as EF would return.
        Shift first = Build.Template(1, location: Build.Place(1, "Bar"), amount: 100m);
        Shift second = Build.Template(2, location: Build.Place(1, "Bar"), amount: 100m);

        _query.Days.Add(Build.WorkedDay("2026-03-02", first));
        _query.Days.Add(Build.WorkedDay("2026-03-03", second));

        DaysDto result = await Range();

        LocationTotalDto total = Assert.Single(result.by_location);

        Assert.Equal(2, total.days_worked);
        Assert.Equal(16, total.hours);
    }

    [Fact]
    public async Task ShiftsWithNoPlaceStillSum()
    {
        Shift template = Build.Template(1, amount: 100m);

        _query.Days.Add(Build.WorkedDay("2026-03-02", template));

        DaysDto result = await Range();

        LocationTotalDto total = Assert.Single(result.by_location);

        Assert.Equal(0, total.location_id);
        Assert.Equal(800m, total.earned);
    }

    // ==== Payouts and the range guard ====

    [Fact]
    public async Task TheDifferenceIsWhatWasPaidLessWhatWasCalculated()
    {
        _query.Days.Add(Build.WorkedDay("2026-03-02", Build.Template(1, amount: 100m)));
        _query.Payouts.Add(new Payout
        {
            UserId = Build.UserId,
            PeriodFrom = DateOnly.Parse("2026-03-01"),
            PeriodTo = DateOnly.Parse("2026-03-31"),
            Amount = 700m,
            ReceivedOn = DateOnly.Parse("2026-04-05"),
        });

        DaysDto result = await Range();

        Assert.Equal(700m, result.paid);
        Assert.Equal(-100m, result.difference);
    }

    [Fact]
    public async Task NoPayoutMeansNoDifferenceRatherThanAShortfall()
    {
        _query.Days.Add(Build.WorkedDay("2026-03-02", Build.Template(1, amount: 100m)));

        DaysDto result = await Range();

        Assert.Equal(0m, result.paid);
        Assert.Equal(0m, result.difference);
    }

    [Fact]
    public async Task ABackwardsRangeIsRejected()
    {
        await Assert.ThrowsAsync<Shifter.Application.Common.Exceptions.ValidationException>(
            () => Range("2026-03-31", "2026-03-01"));
    }

    [Fact]
    public async Task DaysWorkedAndPlannedAreCountedApart()
    {
        Shift template = Build.Template(1, amount: 100m);

        _query.Days.Add(Build.WorkedDay("2026-03-02", template));
        _query.Days.Add(Build.WorkedDay("2026-03-03", template, worked: false));

        DaysDto result = await Range();

        Assert.Equal(1, result.days_worked);
        Assert.Equal(1, result.days_planned);
        Assert.Equal(800m, result.total_earned);
        Assert.Equal(800m, result.planned_earned);
    }
}
