using Shifter.Application.Features.business.DTOs;
using Shifter.Application.Features.business.Services;
using Shifter.Domain.Entities;

using Xunit;

namespace Shifter.Tests;

/// <summary>
/// The overtime rule: hours past the weekly threshold are paid at the
/// multiplier, and only the part past the line is topped up.
/// </summary>
public class DayHandlerOvertimeTests
{
    private readonly FakeShifterQuery _query = new();
    private readonly DayHandler _handler;

    public DayHandlerOvertimeTests()
    {
        _handler = new DayHandler(new FakeShifterCommand(), _query);
    }

    private Task<DaysDto> Range(string from = "2026-03-01", string to = "2026-03-31")
        => _handler.ListAsync(
            Build.UserId, DateOnly.Parse(from), DateOnly.Parse(to), CancellationToken.None);

    /// <summary>Five eight-hour days in one ISO week: exactly at the line.</summary>
    private void ArrangeWeek(Location place, Shift template, int days, string firstDate)
    {
        // Callers arrange several weeks at the same place; the real query never
        // hands back the same location twice.
        if (_query.Locations.All(existing => existing.Id != place.Id))
            _query.Locations.Add(place);

        DateOnly start = DateOnly.Parse(firstDate);

        for (int index = 0; index < days; index += 1)
        {
            _query.Days.Add(Build.WorkedDay(
                start.AddDays(index).ToString("yyyy-MM-dd"), template));
        }
    }

    [Fact]
    public async Task FortyHoursExactlyIsNotOvertime()
    {
        Location place = Build.Place(1);

        // 2026-03-02 is a Monday, so all five days sit in the same ISO week.
        ArrangeWeek(place, Build.Template(1, location: place, amount: 100m), 5, "2026-03-02");

        DaysDto result = await Range();

        Assert.Equal(40, result.hours);
        Assert.Equal(0, result.overtime_hours);
        Assert.Equal(0m, result.overtime_earned);
        Assert.Equal(4000m, result.total_earned);
    }

    [Fact]
    public async Task TheSixthDayIsEntirelyOvertime()
    {
        Location place = Build.Place(1);

        ArrangeWeek(place, Build.Template(1, location: place, amount: 100m), 6, "2026-03-02");

        DaysDto result = await Range();

        Assert.Equal(48, result.hours);
        Assert.Equal(8, result.overtime_hours);
        // Only the extra half-rate on top: 8 h * 100 * (1.5 - 1).
        Assert.Equal(400m, result.overtime_earned);
        Assert.Equal(4800m + 400m, result.total_earned);
    }

    [Fact]
    public async Task OnlyThePartPastTheLineIsToppedUp()
    {
        Location place = Build.Place(1);
        Shift template = Build.Template(1, location: place, amount: 100m, start: "09:00", end: "18:00");

        // Five nine-hour days: 45 h, of which 5 sit past the threshold.
        ArrangeWeek(place, template, 5, "2026-03-02");

        DaysDto result = await Range();

        Assert.Equal(45, result.hours);
        Assert.Equal(5, result.overtime_hours);
        Assert.Equal(250m, result.overtime_earned);
    }

    [Fact]
    public async Task TheThresholdResetsEachWeek()
    {
        Location place = Build.Place(1);
        Shift template = Build.Template(1, location: place, amount: 100m);

        // Five days in one ISO week, five in the next: neither crosses 40 h.
        ArrangeWeek(place, template, 5, "2026-03-02");
        ArrangeWeek(place, template, 5, "2026-03-09");

        DaysDto result = await Range();

        Assert.Equal(80, result.hours);
        Assert.Equal(0, result.overtime_hours);
    }

    [Fact]
    public async Task EachPlaceCountsItsOwnWeek()
    {
        Location bar = Build.Place(1, "Bar");
        Location cafe = Build.Place(2, "Cafe");

        _query.Locations.Add(bar);
        _query.Locations.Add(cafe);

        Shift atBar = Build.Template(1, location: bar, amount: 100m);
        Shift atCafe = Build.Template(2, location: cafe, amount: 100m);

        // 30 h at each place in the same week: 60 h in total, no overtime,
        // because neither employer saw more than 40.
        for (int index = 0; index < 3; index += 1)
        {
            _query.Days.Add(Build.WorkedDay($"2026-03-0{2 + index}", atBar));
            _query.Days.Add(Build.WorkedDay($"2026-03-0{5 + index}", atCafe));
        }

        DaysDto result = await Range();

        Assert.Equal(48, result.hours);
        Assert.Equal(0, result.overtime_hours);
    }

    [Fact]
    public async Task ThePlacesOwnThresholdWins()
    {
        Location place = Build.Place(1, overtimeAfter: 32, multiplier: 2m);

        ArrangeWeek(place, Build.Template(1, location: place, amount: 100m), 5, "2026-03-02");

        DaysDto result = await Range();

        Assert.Equal(8, result.overtime_hours);
        Assert.Equal(800m, result.overtime_earned);
    }

    /// <summary>
    /// A salaried shift has no hourly base to multiply. The hours are still
    /// reported as overtime, but no money is invented for them.
    /// </summary>
    [Fact]
    public async Task ASalariedShiftEarnsNoOvertimeMoney()
    {
        Location place = Build.Place(1);
        Shift template = Build.Template(
            1, location: place, period: SalaryPeriod.Month, amount: 40000m);

        ArrangeWeek(place, template, 6, "2026-03-02");

        DaysDto result = await Range();

        Assert.Equal(8, result.overtime_hours);
        Assert.Equal(0m, result.overtime_earned);
    }

    [Fact]
    public async Task PlannedShiftsDoNotTriggerOvertime()
    {
        Location place = Build.Place(1);
        Shift template = Build.Template(1, location: place, amount: 100m);

        _query.Locations.Add(place);

        for (int index = 0; index < 6; index += 1)
        {
            _query.Days.Add(Build.WorkedDay(
                DateOnly.Parse("2026-03-02").AddDays(index).ToString("yyyy-MM-dd"),
                template,
                worked: false));
        }

        DaysDto result = await Range();

        Assert.Equal(0, result.hours);
        Assert.Equal(0, result.overtime_hours);
        Assert.Equal(48, result.planned_hours);
    }

    /// <summary>
    /// A place created before the overtime rule existed got 0 in the column,
    /// because that is what the type's zero is. The pay is
    /// `hours × rate × (multiplier − 1)`, so 0 makes the factor −1 and every
    /// overtime hour subtracts an hour's pay — reported, to the person it
    /// happened to, as what the overtime brought them.
    ///
    /// The rows are repaired by a migration. This is the other half: the sum
    /// itself refuses to run backwards, whatever any row holds.
    /// </summary>
    [Fact]
    public async Task Overtime_never_takes_money_away_however_bad_the_row_is()
    {
        Location place = Build.Place(1, multiplier: 0m);

        ArrangeWeek(place, Build.Template(1, location: place, amount: 100m), 6, "2026-03-02");

        DaysDto result = await Range();

        Assert.Equal(8, result.overtime_hours);
        Assert.Equal(0m, result.overtime_earned);
        // Six eight-hour days at 100. Nothing has been taken off.
        Assert.Equal(4800m, result.total_earned);
    }

    [Fact]
    public async Task A_multiplier_of_one_is_hours_paid_flat_not_a_penalty()
    {
        Location place = Build.Place(1, multiplier: 1m);

        ArrangeWeek(place, Build.Template(1, location: place, amount: 100m), 6, "2026-03-02");

        DaysDto result = await Range();

        Assert.Equal(8, result.overtime_hours);
        Assert.Equal(0m, result.overtime_earned);
        Assert.Equal(4800m, result.total_earned);
    }

    /// <summary>
    /// The other half of the same defect. The weekly threshold arrived on
    /// existing rows as 0, and `place?.OvertimeWeeklyHours ?? 40` only catches
    /// a place that is absent, not one holding a zero — so the first hour of
    /// the week was overtime and so was every hour after it. Together with the
    /// zero multiplier it cancelled the month's pay outright.
    /// </summary>
    [Fact]
    public async Task A_place_with_no_threshold_uses_the_ordinary_week()
    {
        Location place = Build.Place(1, overtimeAfter: 0);

        ArrangeWeek(place, Build.Template(1, location: place, amount: 100m), 5, "2026-03-02");

        DaysDto result = await Range();

        // Forty hours is a week, not forty hours of overtime.
        Assert.Equal(0, result.overtime_hours);
        Assert.Equal(0m, result.overtime_earned);
        Assert.Equal(4000m, result.total_earned);
    }

    [Fact]
    public async Task Both_halves_broken_at_once_still_pays_the_week()
    {
        // Exactly what a place created before either rule existed held.
        Location place = Build.Place(1, overtimeAfter: 0, multiplier: 0m);

        ArrangeWeek(place, Build.Template(1, location: place, amount: 100m), 6, "2026-03-02");

        DaysDto result = await Range();

        Assert.Equal(8, result.overtime_hours);
        Assert.Equal(0m, result.overtime_earned);
        Assert.Equal(4800m, result.total_earned);
    }
}
