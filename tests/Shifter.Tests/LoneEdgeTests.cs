using Shifter.Application.Common.Time;
using Shifter.Application.Features.business.DTOs;
using Shifter.Application.Features.business.Services;
using Shifter.Domain.Entities;

using Xunit;

namespace Shifter.Tests;

/// <summary>Either edge of the recorded clock can arrive alone now. The old rule dropped a lone edge so it could not price an interval nobody worked; Фактически set in advance and a manual start writing its edge both need it kept, and pricing already looks for both.</summary>
public class LoneEdgeTests
{
    private static readonly DateOnly Friday = new(2026, 11, 6);

    private static readonly DateTimeOffset Instant = new(2026, 11, 6, 20, 0, 0, TimeSpan.Zero);

    private readonly FakeShifterQuery _query = new();
    private readonly FakeShifterCommand _command;
    private readonly DayHandler _handler;

    public LoneEdgeTests()
    {
        Shift template = Build.Template(7, start: "11:00", end: "22:00", amount: 100m);

        template.WeekHours = [new WeekdayHours
        {
            Weekday = 5,
            StartTime = new TimeOnly(11, 0),
            EndTime = new TimeOnly(23, 0),
        }];

        _query.Shifts.Add(template);
        _command = new FakeShifterCommand(_query);
        _handler = new DayHandler(_command, _query, clock: new AppClock(time: new FixedTime(Instant)));
    }

    private async Task<DayShift> Save(DayShiftSaveDto entry)
    {
        await _handler.SaveAsync(
            new DaySaveDto([entry], null, null, null, null, null, null),
            Build.UserId,
            Friday,
            CancellationToken.None);

        return Assert.Single(_command.Saved.Last().Shifts!);
    }

    [Fact]
    public async Task A_save_places_the_hours_of_its_own_weekday()
    {
        DayShift placed = await Save(new DayShiftSaveDto(7, worked: false));

        Assert.Equal(new TimeOnly(23, 0), placed.EndTime);
    }

    [Fact]
    public async Task A_planned_shift_keeps_a_lone_start_as_sent()
    {
        DayShift placed = await Save(new DayShiftSaveDto(7, worked: false, actual_start: "10:40"));

        Assert.Equal(new TimeOnly(10, 40), placed.ActualStart);
        Assert.Null(placed.ActualEnd);
    }

    [Fact]
    public async Task A_planned_shift_keeps_a_lone_end_as_sent()
    {
        DayShift placed = await Save(new DayShiftSaveDto(7, worked: false, actual_end: "23:30"));

        Assert.Null(placed.ActualStart);
        Assert.Equal(new TimeOnly(23, 30), placed.ActualEnd);
    }

    [Fact]
    public async Task A_lone_edge_on_a_planned_shift_prices_nothing()
    {
        DayShift placed = await Save(new DayShiftSaveDto(7, worked: false, actual_start: "20:00"));

        // Twelve hours of plan, not the three between that edge and the end.
        Assert.Equal(TimeSpan.FromHours(12), placed.Duration);
    }

    [Fact]
    public async Task A_worked_shift_takes_its_missing_end_from_the_plan()
    {
        DayShift placed = await Save(new DayShiftSaveDto(7, worked: true, actual_start: "10:40"));

        Assert.Equal(new TimeOnly(10, 40), placed.ActualStart);
        Assert.Equal(new TimeOnly(23, 0), placed.ActualEnd);
    }

    [Fact]
    public async Task A_worked_shift_takes_its_missing_start_from_the_plan()
    {
        DayShift placed = await Save(new DayShiftSaveDto(7, worked: true, actual_end: "23:30"));

        Assert.Equal(new TimeOnly(11, 0), placed.ActualStart);
        Assert.Equal(new TimeOnly(23, 30), placed.ActualEnd);
    }

    [Fact]
    public async Task The_plan_it_takes_from_is_the_one_the_placement_sits_on()
    {
        // Timed by a rota, so the template's Friday is not this shift's plan.
        DayShift timed = DayShift.From(_query.Shifts[0], worked: false, Friday);

        timed.StartTime = new TimeOnly(15, 0);
        timed.EndTime = new TimeOnly(21, 30);

        _query.Days.Add(new Day { UserId = Build.UserId, Date = Friday, Shifts = [timed] });

        DayShift placed = await Save(new DayShiftSaveDto(7, worked: true, actual_end: "22:00"));

        Assert.Equal(new TimeOnly(15, 0), placed.ActualStart);
    }

    [Fact]
    public async Task Both_edges_stay_as_they_came()
    {
        DayShift placed = await Save(
            new DayShiftSaveDto(7, worked: true, actual_start: "10:40", actual_end: "23:10"));

        Assert.Equal(new TimeOnly(10, 40), placed.ActualStart);
        Assert.Equal(new TimeOnly(23, 10), placed.ActualEnd);
    }

    [Fact]
    public async Task No_edges_stay_none()
    {
        DayShift placed = await Save(new DayShiftSaveDto(7, worked: true));

        Assert.Null(placed.ActualStart);
        Assert.Null(placed.ActualEnd);
    }

    [Fact]
    public async Task An_edge_that_is_not_a_time_counts_as_absent()
    {
        DayShift placed = await Save(new DayShiftSaveDto(7, worked: true, actual_start: "soon"));

        Assert.Null(placed.ActualStart);
        Assert.Null(placed.ActualEnd);
    }

    [Fact]
    public async Task An_echo_of_the_close_stamps_the_placement_with_the_time_of_the_save()
    {
        DayShift placed = await Save(new DayShiftSaveDto(7, worked: false, auto_closed: true));

        Assert.Equal(Instant.UtcDateTime, placed.AutoClosedAtUtc);
    }

    [Fact]
    public async Task No_echo_leaves_it_unstamped()
    {
        DayShift placed = await Save(new DayShiftSaveDto(7, worked: false));

        Assert.Null(placed.AutoClosedAtUtc);
    }

    [Fact]
    public async Task The_day_says_whether_the_close_has_had_its_say()
    {
        DayDto day = await _handler.SaveAsync(
            new DaySaveDto([new DayShiftSaveDto(7, worked: false, auto_closed: true)], null, null, null, null, null, null),
            Build.UserId,
            Friday,
            CancellationToken.None);

        Assert.True(day.shifts.Single().auto_closed);
    }
}
