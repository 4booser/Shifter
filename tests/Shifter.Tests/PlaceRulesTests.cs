using Shifter.Application.Features.business.DTOs;
using Shifter.Application.Features.business.Services;
using Shifter.Domain.Entities;

using Xunit;

namespace Shifter.Tests;

/// <summary>Two house rules that live on a place rather than on every template: the unpaid break a long shift earns…</summary>
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
        new DaySaveDto([new DayShiftSaveDto(1, worked: true)], null, null, null, null, null, null, null),
        Build.UserId,
        DateOnly.Parse("2026-03-10"),
        CancellationToken.None);

    // ==== The automatic break ====

    [Fact]
    public async Task ADayPaintedOverIsPricedLikeTheDaySavedByHand()
    {
        Template(Place(afterHours: 6m, minutes: 30), "10:00", "20:00");

        DayDto[] painted = await _handler.BulkAsync(
            new BulkShiftDto([DateOnly.Parse("2026-03-10")], 1, "add"),
            Build.UserId,
            CancellationToken.None);

        Assert.True(painted[0].shifts[0].worked);
        Assert.Equal(30, painted[0].shifts[0].break_minutes);
        Assert.Equal((await Save()).shifts[0].hours, painted[0].shifts[0].hours);
    }

    [Fact]
    public void OnlyMinutesTheRuleCouldHavePutThereAreTheRules()
    {
        Location place = Place(afterHours: 6m, minutes: 30);

        // Ten hours at the rule's own 30: nothing says a person took them.
        Assert.Equal(0, Held(place, "10:00", "20:00", breakMinutes: 30).OwnBreak(place));

        // Past the rule's figure, or on hours it does not reach, somebody did.
        Assert.Equal(45, Held(place, "10:00", "20:00", breakMinutes: 45).OwnBreak(place));
        Assert.Equal(30, Held(place, "10:00", "15:00", breakMinutes: 30).OwnBreak(place));

        // No rule, nothing to tell apart.
        Assert.Equal(30, Held(place: null, "10:00", "20:00", breakMinutes: 30).OwnBreak(null));
    }

    private static DayShift Held(Location? place, string start, string end, int breakMinutes)
    {
        DayShift placed = DayShift.From(Build.Template(1, location: place, start: start, end: end), worked: true);

        placed.BreakMinutes = breakMinutes;

        return placed;
    }

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

    // ==== The rule on a save over a placement already on the day ====

    private static readonly DateOnly OnTheDay = DateOnly.Parse("2026-03-10");

    /// <summary>The template stands at ten hours under a rule of 30 minutes past six.</summary>
    private Shift UnderTheRule() => Template(Place(afterHours: 6m, minutes: 30), "10:00", "20:00");

    /// <summary>A placement already on the day with the hours and edges the test needs, and no break.</summary>
    private DayShift OnDay(
        Shift template,
        string start,
        string end,
        string? actualStart = null,
        string? actualEnd = null,
        bool worked = true,
        DateTime? stamped = null)
    {
        DayShift row = DayShift.From(template, worked);

        row.StartTime = TimeOnly.Parse(start);
        row.EndTime = TimeOnly.Parse(end);
        row.ActualStart = actualStart is null ? null : TimeOnly.Parse(actualStart);
        row.ActualEnd = actualEnd is null ? null : TimeOnly.Parse(actualEnd);
        row.BreakMinutes = 0;
        row.AutoClosedAtUtc = stamped;

        _query.Days.Add(new Day { UserId = Build.UserId, Date = OnTheDay, Shifts = [row] });

        return row;
    }

    private Task<DayDto> SaveOver(DayShiftSaveDto entry) => _handler.SaveAsync(
        new DaySaveDto([entry], null, null, null, null, null, null, null),
        Build.UserId,
        OnTheDay,
        CancellationToken.None);

    [Fact]
    public async Task ASaveWithoutEdgesReadsThePlacementsHoursNotTheTemplates()
    {
        OnDay(UnderTheRule(), "10:00", "15:00");

        DayDto saved = await SaveOver(new DayShiftSaveDto(1, worked: true, break_minutes: 0));

        Assert.Equal(0, saved.shifts[0].break_minutes);
    }

    [Fact]
    public async Task ALoneEdgeOnAPlannedShiftStillLeavesItOnThePlacementsHours()
    {
        OnDay(UnderTheRule(), "10:00", "15:00", worked: false);

        // Duration asks for both edges, so a lone one leaves the plan in charge.
        DayDto saved = await SaveOver(
            new DayShiftSaveDto(1, worked: false, actual_start: "09:30", break_minutes: 0));

        Assert.Equal(0, saved.shifts[0].break_minutes);
    }

    [Fact]
    public async Task ASaveClearingTheEdgesIsWeighedOnThePlanTheyGoBackTo()
    {
        // Four hours on the edges and ten on the plan, and this save sends none.
        OnDay(UnderTheRule(), "10:00", "20:00", actualStart: "10:00", actualEnd: "14:00");

        DayDto saved = await SaveOver(new DayShiftSaveDto(1, worked: true, break_minutes: 0));

        Assert.Equal(30, saved.shifts[0].break_minutes);
    }

    [Fact]
    public async Task ASaveThatNeverSawTheCloseIsWeighedOnTheEdgesItCannotTouch()
    {
        // Ten hours on the plan, four on what the close left, and the merge
        // will keep the four.
        OnDay(
            UnderTheRule(),
            "10:00",
            "20:00",
            actualStart: "10:00",
            actualEnd: "14:00",
            stamped: new DateTime(2026, 3, 10, 12, 0, 0, DateTimeKind.Utc));

        DayDto saved = await SaveOver(
            new DayShiftSaveDto(1, worked: false, actual_end: "14:00", break_minutes: 0));

        Assert.Equal(0, saved.shifts[0].break_minutes);
    }

    [Fact]
    public async Task ASaveNamingBothEdgesIsWeighedOnThoseEdges()
    {
        OnDay(UnderTheRule(), "10:00", "15:00");

        DayDto saved = await SaveOver(new DayShiftSaveDto(
            1, worked: true, actual_start: "10:00", actual_end: "20:00", break_minutes: 0));

        Assert.Equal(30, saved.shifts[0].break_minutes);
    }

    [Fact]
    public async Task APlacementNewToTheDayIsWeighedOnTheTemplatesHours()
    {
        Shift template = UnderTheRule();

        DayShift other = DayShift.From(Build.Template(2), worked: true);

        _query.Days.Add(new Day { UserId = Build.UserId, Date = OnTheDay, Shifts = [other] });

        DayDto saved = await SaveOver(new DayShiftSaveDto(template.Id, worked: true, break_minutes: 0));

        Assert.Equal(30, saved.shifts[0].break_minutes);
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
