using Shifter.Application.Features.business.DTOs;
using Shifter.Application.Features.business.Services;
using Shifter.Domain.Entities;

using Xunit;

namespace Shifter.Tests;

/// <summary>
/// The invariants a review found broken, each pinned by the scenario that
/// broke it. The one that matters most is the last: the parts have to sum to
/// the whole. Every defect here was a place where they did not.
/// </summary>
public class MoneyIntegrityTests
{
    private readonly FakeShifterQuery _query = new();
    private readonly DayHandler _handler;

    public MoneyIntegrityTests()
    {
        _handler = new DayHandler(new FakeShifterCommand(), _query);
    }

    private Task<DaysDto> Range(string from, string to)
        => _handler.ListAsync(Build.UserId, DateOnly.Parse(from), DateOnly.Parse(to), CancellationToken.None);

    private Location Place(
        int id,
        string name,
        decimal tax = 0m,
        decimal holiday = 0m,
        decimal tipOutOfTips = 0m,
        decimal meal = 0m)
    {
        Location place = Build.Place(id, name, tipOutOfTips: tipOutOfTips, meal: meal);

        place.TaxPercent = tax;
        place.HolidayPercent = holiday;
        _query.Locations.Add(place);

        return place;
    }

    // ==== A monthly wage is money like any other ====

    [Fact]
    public async Task AMonthlySalaryIsTaxedAndAccruesHolidayLikeEverythingElse()
    {
        // It used to report a take-home equal to the gross and a holiday
        // accrual of zero, because the per-place figures only ever saw the
        // hourly pay — and every derived number is built from those.
        Location bar = Place(1, "Bar", tax: 20m, holiday: 10m);
        Shift monthly = Build.Template(1, location: bar, period: SalaryPeriod.Month, amount: 40_000m);

        for (int day = 1; day <= 20; day++)
            _query.Days.Add(Build.WorkedDay($"2026-01-{day:00}", monthly));

        DaysDto month = await Range("2026-01-01", "2026-01-31");

        Assert.Equal(40_000m, month.total_earned);
        Assert.Equal(8_000m, month.tax);
        Assert.Equal(32_000m, month.net_earned);
        Assert.Equal(4_000m, month.holiday_accrued);

        LocationTotalDto place = Assert.Single(month.by_location);

        Assert.Equal(40_000m, place.earned);
        Assert.Equal(8_000m, place.tax);
    }

    [Fact]
    public async Task OvertimeAndNightPayAreTaxedToo()
    {
        // The extras existed only in the headline, so tax was charged on the
        // base and the premium rode free.
        Location bar = Place(1, "Bar", tax: 20m);

        bar.NightMultiplier = 1.5m;
        bar.NightFrom = new TimeOnly(22, 0);
        bar.NightTo = new TimeOnly(6, 0);

        Shift night = Build.Template(1, location: bar, amount: 100m, start: "22:00", end: "06:00");

        for (int day = 1; day <= 6; day++)
            _query.Days.Add(Build.WorkedDay($"2026-01-{day:00}", night));

        DaysDto month = await Range("2026-01-01", "2026-01-31");

        // Whatever the total is, the tax must be a fifth of it and the parts
        // must add up — those are the two claims that were false.
        Assert.Equal(Math.Round(month.total_earned * 0.2m, 2), Math.Round(month.tax, 2));
        Assert.Equal(month.total_earned, month.by_location.Sum(place => place.earned));
    }

    // ==== A day split between two employers ====

    [Fact]
    public async Task EachPlaceTipsOutByItsOwnRuleOnItsOwnShare()
    {
        // The rule used to be taken from whichever place was listed first and
        // applied to the whole day — including the other employer's tips — and
        // the order was not even stable.
        Location bar = Place(1, "Bar", tipOutOfTips: 10m);
        Location cafe = Place(2, "Cafe");

        Shift atBar = Build.Template(1, location: bar, start: "08:00", end: "14:00");
        Shift atCafe = Build.Template(2, location: cafe, start: "14:00", end: "16:00");

        _query.Days.Add(new Day
        {
            UserId = Build.UserId,
            Date = DateOnly.Parse("2026-01-05"),
            Tips = 1_000m,
            Shifts = [DayShift.From(atBar, true), DayShift.From(atCafe, true)],
        });

        DaysDto month = await Range("2026-01-01", "2026-01-31");

        // Six of eight hours at the bar, ten percent of its share of the tips.
        Assert.Equal(75m, Math.Round(month.tip_out, 2));
    }

    [Fact]
    public async Task OnePlacesStaffMealIsNotChargedToTheOther()
    {
        // The meals were pooled and re-split by hours, so the cafe next door
        // paid for the bar's lunch — and its reconciliation expected less.
        Location bar = Place(1, "Bar", meal: 200m);
        Location cafe = Place(2, "Cafe");

        Shift atBar = Build.Template(1, location: bar, start: "08:00", end: "14:00");
        Shift atCafe = Build.Template(2, location: cafe, start: "14:00", end: "16:00");

        _query.Days.Add(new Day
        {
            UserId = Build.UserId,
            Date = DateOnly.Parse("2026-01-05"),
            Shifts = [DayShift.From(atBar, true), DayShift.From(atCafe, true)],
        });

        DaysDto month = await Range("2026-01-01", "2026-01-31");

        LocationTotalDto barRow = month.by_location.Single(row => row.location_id == 1);
        LocationTotalDto cafeRow = month.by_location.Single(row => row.location_id == 2);

        Assert.Equal(200m, barRow.deductions);
        Assert.Equal(0m, cafeRow.deductions);
    }

    // ==== The parts have to sum to the whole ====

    [Fact]
    public async Task TipsOnADayStillMarkedPlannedAreNotLostFromThePerPlaceFigures()
    {
        // They stayed in the total and vanished from every per-place figure,
        // so they were also untaxed — and ticking "worked" afterwards made the
        // total go down.
        Location bar = Place(1, "Bar", tax: 20m, tipOutOfTips: 10m);
        bar.TaxTips = true;

        Shift shift = Build.Template(1, location: bar);

        _query.Days.Add(Build.WorkedDay("2026-01-05", shift, worked: false, tips: 1_000m));

        DaysDto month = await Range("2026-01-01", "2026-01-31");

        Assert.Equal(1_000m, month.by_location.Sum(place => place.tips));
        Assert.Equal(month.total_earned, month.by_location.Sum(place => place.earned));
        Assert.True(month.tax > 0m, "tips the place taxes must be taxed");
    }

    [Fact]
    public async Task ADayRateShiftWithNoClockKeepsItsTips()
    {
        // Zero hours meant a share of zero, so five thousand in tips was
        // dropped from the per-place figures while staying in the total.
        Location bar = Place(1, "Bar");
        Shift allDay = Build.Template(
            1, location: bar, period: SalaryPeriod.Day, amount: 1_200m, start: "00:00", end: "00:00");

        _query.Days.Add(Build.WorkedDay("2026-01-05", allDay, tips: 5_000m));

        DaysDto month = await Range("2026-01-01", "2026-01-31");

        Assert.Equal(5_000m, month.by_location.Sum(place => place.tips));
        Assert.Equal(month.total_earned, month.by_location.Sum(place => place.earned));
    }

    // ==== Weeks and months do not line up ====

    [Fact]
    public async Task OvertimeSurvivesAWeekThatCrossesTheFirstOfTheMonth()
    {
        // The threshold is weekly and the calendar is read a month at a time,
        // so a week straddling the boundary reached its threshold in neither
        // month and the money simply disappeared.
        Location bar = Place(1, "Bar");
        Shift shift = Build.Template(1, location: bar, amount: 100m, start: "09:00", end: "17:00");

        foreach (string date in new[]
        {
            "2026-03-30", "2026-03-31", "2026-04-01", "2026-04-02", "2026-04-03", "2026-04-04",
        })
        {
            _query.Days.Add(Build.WorkedDay(date, shift));
        }

        DaysDto march = await Range("2026-03-01", "2026-03-31");
        DaysDto april = await Range("2026-04-01", "2026-04-30");
        DaysDto both = await Range("2026-03-01", "2026-04-30");

        // Forty-eight hours in one week, eight of them past the line.
        Assert.Equal(8, both.overtime_hours);
        Assert.Equal(400m, both.overtime_earned);

        // And the two months together must not report more than the pair.
        Assert.Equal(
            both.overtime_earned,
            march.overtime_earned + april.overtime_earned);
    }

    [Fact]
    public async Task AWeeklyWageIsNotPaidTwiceBecauseItsWeekTouchedTwoMonths()
    {
        // Charged once to March and once to April, so anybody adding two
        // months together paid it twice.
        Location bar = Place(1, "Bar");
        Shift weekly = Build.Template(1, location: bar, period: SalaryPeriod.Week, amount: 10_000m);

        foreach (string date in new[] { "2026-03-30", "2026-03-31", "2026-04-01", "2026-04-02" })
            _query.Days.Add(Build.WorkedDay(date, weekly));

        DaysDto march = await Range("2026-03-01", "2026-03-31");
        DaysDto april = await Range("2026-04-01", "2026-04-30");
        DaysDto both = await Range("2026-03-01", "2026-04-30");

        Assert.Equal(10_000m, both.period_earned);
        Assert.Equal(both.period_earned, march.period_earned + april.period_earned);
    }

    // ==== The night does not stop at midnight ====

    [Fact]
    public async Task TheNightPremiumIsNotPaidThroughAnUnpaidBreak()
    {
        // Night hours were measured on the raw clock and the wage on the paid
        // hours, so the premium ran through the break — about 35 a shift.
        Location bar = Place(1, "Bar");

        bar.NightMultiplier = 1.35m;
        bar.NightFrom = new TimeOnly(22, 0);
        bar.NightTo = new TimeOnly(6, 0);

        Shift night = Build.Template(1, location: bar, amount: 100m, start: "22:00", end: "06:00");

        Day day = Build.WorkedDay("2026-05-05", night);
        day.Shifts![0].BreakMinutes = 60;

        _query.Days.Add(day);

        DaysDto month = await Range("2026-05-01", "2026-05-31");

        // Seven paid hours, all of them inside the window: 7 × 100 × 0.35.
        Assert.Equal(245m, Math.Round(month.premium_earned, 2));
    }

    [Fact]
    public async Task AShiftThatRunsIntoAHolidayIsPaidForIt()
    {
        // Judged by the date it was filed under, a shift starting on the 31st
        // spent six of its eight hours on New Year's Day and was paid nothing
        // for them.
        Location bar = Place(1, "Bar");

        bar.PublicHolidayMultiplier = 2m;
        bar.HolidayCountry = "UA";

        Shift night = Build.Template(1, location: bar, amount: 100m, start: "22:00", end: "06:00");

        _query.Days.Add(Build.WorkedDay("2025-12-31", night));

        DaysDto month = await Range("2025-12-01", "2025-12-31");

        Assert.True(month.premium_earned > 0m, "a shift running into the 1st is a holiday shift");
    }

    [Fact]
    public async Task TenDaysOfASalariedMonthAreWorthTenDaysOfIt()
    {
        // The only figure in the app whose answer depended on where somebody
        // drew the line: asking for the first third of August returned the
        // whole month's wage, so two halves of a month added up to twice it.
        Location bar = Place(1, "Bar");
        Shift monthly = Build.Template(1, location: bar, period: SalaryPeriod.Month, amount: 31_000m);

        // Ten days worked, spread across the month.
        foreach (int day in new[] { 2, 4, 6, 8, 10, 20, 22, 24, 26, 28 })
            _query.Days.Add(Build.WorkedDay($"2026-08-{day:00}", monthly));

        DaysDto first = await Range("2026-08-01", "2026-08-15");
        DaysDto second = await Range("2026-08-16", "2026-08-31");
        DaysDto whole = await Range("2026-08-01", "2026-08-31");

        Assert.Equal(31_000m, whole.period_earned);
        Assert.Equal(whole.period_earned, first.period_earned + second.period_earned);
        // Five of the ten days worked fall in each half.
        Assert.Equal(15_500m, first.period_earned);
    }

    [Fact]
    public async Task ARangeWithNoneOfThePeriodsShiftsInItOwesNothing()
    {
        Location bar = Place(1, "Bar");
        Shift monthly = Build.Template(1, location: bar, period: SalaryPeriod.Month, amount: 31_000m);

        _query.Days.Add(Build.WorkedDay("2026-08-04", monthly));

        DaysDto empty = await Range("2026-08-10", "2026-08-20");

        Assert.Equal(0m, empty.period_earned);
    }

    // ==== A meal is charged for a shift somebody went to ====

    /// <summary>
    /// A place that withholds for a staff meal charged it on presence rather
    /// than on work, and a day holding nothing but next week's plan came out
    /// at minus eighty: a day in the red for a meal nobody has eaten, on a
    /// shift nobody has been to. Anybody scrolling forward through their own
    /// rota saw it on every planned day.
    /// </summary>
    [Fact]
    public async Task A_planned_day_is_not_charged_for_a_meal_nobody_has_eaten()
    {
        Location place = Place(1, "Бар", meal: 80m);
        Shift template = Build.Template(1, location: place, amount: 200m);

        _query.Days.Add(Build.WorkedDay("2026-03-10", template, worked: false));

        DaysDto result = await Range("2026-03-10", "2026-03-10");

        Assert.Equal(0m, result.total_earned);
        Assert.Equal(0m, result.deductions);
    }

    [Fact]
    public async Task A_worked_day_still_pays_for_its_meal()
    {
        Location place = Place(1, "Бар", meal: 80m);
        Shift template = Build.Template(1, location: place, amount: 200m);

        _query.Days.Add(Build.WorkedDay("2026-03-10", template));

        DaysDto result = await Range("2026-03-10", "2026-03-10");

        Assert.Equal(80m, result.deductions);
        // Eight hours at 200, less the meal.
        Assert.Equal(1520m, result.total_earned);
    }

    [Fact]
    public async Task Only_the_place_that_was_worked_charges_for_the_meal()
    {
        // Two places on one day: one worked, one still a plan. Charging both
        // is the same bug read the other way round.
        Location bar = Place(1, "Бар", meal: 80m);
        Location cafe = Place(2, "Кофейня", meal: 50m);

        Shift barShift = Build.Template(1, location: bar, amount: 200m);
        Shift cafeShift = Build.Template(2, location: cafe, amount: 150m);

        _query.Days.Add(new Domain.Entities.Day
        {
            UserId = Build.UserId,
            Date = DateOnly.Parse("2026-03-10"),
            Shifts =
            [
                Domain.Entities.DayShift.From(barShift, worked: true),
                Domain.Entities.DayShift.From(cafeShift, worked: false),
            ],
        });

        DaysDto result = await Range("2026-03-10", "2026-03-10");

        Assert.Equal(80m, result.deductions);
    }
}
