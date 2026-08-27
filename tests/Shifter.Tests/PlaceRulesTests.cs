using Shifter.Application.Features.business.DTOs;
using Shifter.Application.Features.business.Services;
using Shifter.Domain.Entities;

using Xunit;

namespace Shifter.Tests;

/// <summary>
/// Two house rules that live on a place rather than on every template: the
/// unpaid break a long shift earns automatically, and the hourly floor the
/// person will not go under there. Both change money, so both are pinned.
/// </summary>
public class PlaceRulesTests
{
    private readonly FakeShifterQuery _query = new();
    private readonly DayHandler _handler;

    public PlaceRulesTests()
    {
        _handler = new DayHandler(new FakeShifterCommand(_query), _query);
    }

    private Location Place(decimal afterHours = 0m, int minutes = 0, decimal floor = 0m)
    {
        var place = Build.Place(1);

        place.AutoBreakAfterHours = afterHours;
        place.AutoBreakMinutes = minutes;
        place.MinimumHourly = floor;
        _query.Locations.Add(place);

        return place;
    }

    private Shift Template(Location place, string start, string end, decimal amount = 200m)
    {
        var template = Build.Template(1, location: place, start: start, end: end, amount: amount);

        _query.Shifts.Add(template);

        return template;
    }

    private Task<DayDto> Save() => _handler.SaveAsync(
        new DaySaveDto([new DayShiftSaveDto(1, worked: true)], null, null, null, null, null, null),
        Build.UserId,
        DateOnly.Parse("2026-03-10"),
        CancellationToken.None);

    // ==== The automatic break ====

    [Fact]
    public async Task ALongShiftEarnsTheHousesBreakWithoutBeingTold()
    {
        Template(Place(afterHours: 6m, minutes: 30), "10:00", "20:00");

        DayDto saved = await Save();

        Assert.Equal(30, saved.shifts[0].break_minutes);
        Assert.Equal(9.5, saved.shifts[0].hours);
    }

    [Fact]
    public async Task AShortShiftDoesNot()
    {
        Template(Place(afterHours: 6m, minutes: 30), "10:00", "15:00");

        DayDto saved = await Save();

        Assert.Equal(0, saved.shifts[0].break_minutes);
    }

    [Fact]
    public async Task TheRuleIsAFloorAndNeverShortensABookedBreak()
    {
        var template = Template(Place(afterHours: 6m, minutes: 30), "10:00", "20:00");

        // The template knows something the house rule does not.
        template.Breaks = [new Break { Duration = TimeSpan.FromMinutes(60) }];

        DayDto saved = await Save();

        Assert.Equal(60, saved.shifts[0].break_minutes);
    }

    [Fact]
    public async Task HalfARuleIsNoRule()
    {
        // A threshold with no minutes would silently do nothing; the handler
        // clears it rather than storing a rule that cannot fire.
        Template(Place(afterHours: 6m, minutes: 0), "10:00", "20:00");

        DayDto saved = await Save();

        Assert.Equal(0, saved.shifts[0].break_minutes);
    }

    // ==== The floor ====

    [Fact]
    public async Task ADayUnderTheFloorSaysSo()
    {
        Template(Place(floor: 150m), "10:00", "18:00", amount: 100m);

        Assert.True((await Save()).below_floor);
    }

    [Fact]
    public async Task ADayAboveItDoesNot()
    {
        Template(Place(floor: 150m), "10:00", "18:00", amount: 200m);

        Assert.False((await Save()).below_floor);
    }

    [Fact]
    public async Task NoFloorMeansNoVerdict()
    {
        Template(Place(), "10:00", "18:00", amount: 1m);

        Assert.False((await Save()).below_floor);
    }

    [Fact]
    public async Task AnHourlyRateSurvivesTheBreakItLoses()
    {
        // The break takes an hour off both the pay and the hours, so an hourly
        // rate comes out where it started: 160 still clears a floor of 150.
        // The two rules meeting must not invent a shortfall.
        Template(Place(afterHours: 6m, minutes: 60, floor: 150m), "10:00", "18:00", amount: 160m);

        DayDto saved = await Save();

        Assert.Equal(60, saved.shifts[0].break_minutes);
        Assert.Equal(7, saved.shifts[0].hours);
        Assert.False(saved.below_floor);
    }

    [Fact]
    public async Task ADayRateDividedByFewerHoursRisesAboveTheFloor()
    {
        // A flat shift rate is not divided by the break, so losing an unpaid
        // hour raises what the remaining ones are worth. 1000 over eight hours
        // is under a floor of 130; over seven it is not.
        var place = Place(afterHours: 6m, minutes: 60, floor: 130m);
        var template = Build.Template(
            1, location: place, period: SalaryPeriod.Day, amount: 1_000m, start: "10:00", end: "18:00");

        _query.Shifts.Add(template);

        DayDto saved = await Save();

        Assert.Equal(7, saved.shifts[0].hours);
        Assert.False(saved.below_floor);
    }
}
