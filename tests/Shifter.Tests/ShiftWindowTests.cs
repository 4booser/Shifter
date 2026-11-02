using Shifter.Domain.Entities;

using Xunit;

namespace Shifter.Tests;

/// <summary>When a shift opens and closes. Both clients hold these same vectors, because the three have to agree to the minute.</summary>
public class ShiftWindowTests
{
    private static readonly DateOnly Monday = new(2026, 11, 2);

    private static DateTime At(string text) => DateTime.Parse(text);

    private static TimeOnly? Time(string? text) => text is null ? null : TimeOnly.Parse(text);

    private static ShiftWindow Window(string start, string end, string? actualStart = null, string? actualEnd = null)
        => ShiftWindow.Of(Monday, TimeOnly.Parse(start), TimeOnly.Parse(end), Time(actualStart), Time(actualEnd));

    [Fact]
    public void A_a_day_shift_with_no_actuals_runs_its_plan()
    {
        ShiftWindow window = Window("11:00", "22:00");

        Assert.Equal(At("2026-11-02T11:00"), window.Opens);
        Assert.Equal(At("2026-11-02T22:00"), window.Closes);
    }

    [Fact]
    public void B_an_overnight_shift_closes_the_next_morning()
        => Assert.Equal(At("2026-11-03T02:00"), Window("22:00", "02:00").Closes);

    [Fact]
    public void C_a_start_typed_after_midnight_is_the_one_inside_that_night()
    {
        ShiftWindow window = Window("22:00", "02:00", actualStart: "00:30");

        Assert.Equal(At("2026-11-03T00:30"), window.Opens);
        Assert.Equal(At("2026-11-03T02:00"), window.Closes);
    }

    [Fact]
    public void D_an_end_before_midnight_on_an_overnight_shift_is_that_evening()
        => Assert.Equal(At("2026-11-02T23:30"), Window("18:00", "02:00", actualEnd: "23:30").Closes);

    [Fact]
    public void E_early_and_late_edges_stay_on_the_same_date()
    {
        ShiftWindow window = Window("11:00", "22:00", actualStart: "10:40", actualEnd: "23:10");

        Assert.Equal(At("2026-11-02T10:40"), window.Opens);
        Assert.Equal(At("2026-11-02T23:10"), window.Closes);
    }

    [Fact]
    public void F_an_end_just_past_midnight_runs_over_into_tomorrow()
        => Assert.Equal(At("2026-11-03T00:20"), Window("13:00", "23:00", actualEnd: "00:20").Closes);

    [Fact]
    public void A_tie_at_exactly_twelve_hours_takes_the_later_occurrence()
    {
        // Twelve hours from an 11:00 start in both directions: 23:00 that day
        // and 23:00 the day before.
        Assert.Equal(At("2026-11-02T23:00"), Window("11:00", "20:00", actualStart: "23:00").Opens);

        // And from a 12:00 end: midnight either side.
        Assert.Equal(At("2026-11-03T00:00"), Window("08:00", "12:00", actualEnd: "00:00").Closes);
    }

    [Fact]
    public void A_close_that_lands_on_or_before_the_open_moves_a_day_on()
    {
        // The close comes out at 11:00 and the open at 12:00.
        Assert.Equal(At("2026-11-03T11:00"), Window("10:00", "11:00", actualStart: "12:00").Closes);

        // Equal counts: a shift cannot close at the moment it opens.
        Assert.Equal(At("2026-11-03T11:00"), Window("10:00", "11:00", actualStart: "11:00").Closes);
    }

    [Fact]
    public void A_placement_is_read_on_its_own_times_and_edges()
    {
        DayShift entry = new()
        {
            StartTime = new TimeOnly(22, 0),
            EndTime = new TimeOnly(2, 0),
            ActualStart = new TimeOnly(0, 30),
        };

        Assert.Equal(Window("22:00", "02:00", actualStart: "00:30"), ShiftWindow.Of(Monday, entry));
    }

    private static DateTime? StartedAfter(string start, string end, string? actualStart, string? actualEnd = null)
        => ShiftWindow.StartedAfterPlan(
            Monday, TimeOnly.Parse(start), TimeOnly.Parse(end), Time(actualStart), Time(actualEnd));

    [Fact]
    public void A_start_past_the_plan_s_close_sits_on_its_own_day()
    {
        Assert.Equal(At("2026-11-02T18:00"), StartedAfter("09:00", "17:00", "18:00"));

        // Over twelve hours past the plan's start, where the shared rule would
        // call it the evening before.
        Assert.Equal(At("2026-11-02T22:00"), StartedAfter("09:00", "17:00", "22:00"));

        // The very minute of the close leaves nothing of the plan to run.
        Assert.Equal(At("2026-11-02T17:00"), StartedAfter("09:00", "17:00", "17:00"));

        // Past a night shift's morning.
        Assert.Equal(At("2026-11-03T05:00"), StartedAfter("22:00", "02:00", "05:00"));
    }

    [Fact]
    public void A_start_early_or_inside_the_plan_is_nothing_to_do_with_this()
    {
        Assert.Null(StartedAfter("09:00", "17:00", "08:30"));
        Assert.Null(StartedAfter("09:00", "17:00", "12:00"));
        Assert.Null(StartedAfter("11:00", "22:00", "10:40"));
        Assert.Null(StartedAfter("22:00", "02:00", "00:30"));
        Assert.Null(StartedAfter("22:00", "02:00", "21:30"));
    }

    [Fact]
    public void An_end_said_beside_the_start_is_an_answer_and_the_shared_rule_takes_it()
        => Assert.Null(StartedAfter("09:00", "17:00", "22:00", actualEnd: "23:30"));

    [Fact]
    public void No_start_at_all_has_nothing_to_be_late_with()
        => Assert.Null(StartedAfter("09:00", "17:00", null));
}
