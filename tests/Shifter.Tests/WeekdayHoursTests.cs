using Shifter.Application.Common.Exceptions;
using Shifter.Application.Common.Time;
using Shifter.Application.Features.business.DTOs;
using Shifter.Application.Features.business.Services;
using Shifter.Domain.Entities;

using Xunit;

namespace Shifter.Tests;

/// <summary>One template, different hours by weekday, set by the person rather than preset.</summary>
public class WeekdayHoursTests
{
    private static readonly DateOnly Monday = new(2026, 11, 2);
    private static readonly DateOnly Friday = new(2026, 11, 6);
    private static readonly DateOnly Saturday = new(2026, 11, 7);
    private static readonly DateOnly Sunday = new(2026, 11, 8);

    private static WeekdayHours Hours(int weekday, string start, string end) => new()
    {
        Weekday = weekday,
        StartTime = TimeOnly.Parse(start),
        EndTime = TimeOnly.Parse(end),
    };

    /// <summary>Monday to Thursday 11 to 22, Friday 11 to 23, the weekend 13 to 23.</summary>
    private static Shift Week()
    {
        Shift shift = Build.Template(7, start: "11:00", end: "22:00");

        shift.WeekHours =
        [
            Hours(5, "11:00", "23:00"),
            Hours(6, "13:00", "23:00"),
            Hours(7, "13:00", "23:00"),
        ];

        return shift;
    }

    private static (TimeOnly, TimeOnly) Pair(string start, string end)
        => (TimeOnly.Parse(start), TimeOnly.Parse(end));

    [Fact]
    public void A_weekday_with_no_entry_keeps_the_template_hours()
        => Assert.Equal(Pair("11:00", "22:00"), Week().HoursOn(Monday));

    [Fact]
    public void A_weekday_with_an_entry_runs_its_own()
    {
        Assert.Equal(Pair("11:00", "23:00"), Week().HoursOn(Friday));
        Assert.Equal(Pair("13:00", "23:00"), Week().HoursOn(Saturday));
    }

    [Fact]
    public void Sunday_is_seven_and_not_the_zero_dotnet_calls_it()
    {
        Assert.Equal(Pair("13:00", "23:00"), Week().HoursOn(Sunday));

        Shift zero = Build.Template(8, start: "11:00", end: "22:00");

        zero.WeekHours = [Hours(0, "01:00", "02:00")];

        Assert.Equal(Pair("11:00", "22:00"), zero.HoursOn(Sunday));
    }

    [Fact]
    public void A_placement_takes_the_hours_of_its_date()
    {
        DayShift placed = DayShift.From(Week(), worked: false, Friday);

        Assert.Equal(new TimeOnly(23, 0), placed.EndTime);
    }

    [Fact]
    public void Without_a_date_a_placement_takes_the_template_hours()
    {
        DayShift placed = DayShift.From(Week(), worked: false);

        Assert.Equal(new TimeOnly(22, 0), placed.EndTime);
    }

    [Fact]
    public void A_copy_of_the_hours_survives_the_edit_it_was_taken_before()
    {
        Shift shift = Week();
        Shift before = shift.HoursCopy();

        shift.EndTime = new TimeOnly(21, 0);
        shift.WeekHours = [];

        Assert.Equal(Pair("11:00", "22:00"), before.HoursOn(Monday));
        Assert.Equal(Pair("11:00", "23:00"), before.HoursOn(Friday));
    }

    // ==== What a save may say ====

    private static ShiftCreateDto Save(
        WeekHoursDto[]? week,
        int breakMinutes = 0,
        bool? autoClock = null)
        => new ShiftCreateDto(
            "Evening",
            null,
            null,
            "11:00",
            "22:00",
            "hour",
            200m,
            breakMinutes,
            week_hours: week,
            auto_clock: autoClock);

    private static (ShiftHandler Handler, FakeShifterQuery Query) Handler(DateOnly? today = null)
    {
        FakeShifterQuery query = new();
        DateOnly on = today ?? Monday;

        return (
            new ShiftHandler(
                new FakeShifterCommand(query),
                query,
                new AppClock("UTC", new FixedTime(new DateTimeOffset(on.ToDateTime(new TimeOnly(9, 0)), TimeSpan.Zero)))),
            query);
    }

    [Fact]
    public async Task Weekdays_come_back_in_order_with_the_clock_on_by_default()
    {
        var (handler, _) = Handler();

        ShiftDto made = await handler.CreateAsync(
            Save([new WeekHoursDto(7, "13:00", "23:00"), new WeekHoursDto(5, "11:00", "23:00")]),
            Build.UserId,
            CancellationToken.None);

        Assert.Equal([5, 7], made.week_hours.Select(entry => entry.weekday));
        Assert.Equal("23:00", made.week_hours[0].end_time);
        Assert.True(made.auto_clock);
    }

    [Fact]
    public async Task A_template_can_start_with_the_clock_off()
    {
        var (handler, _) = Handler();

        ShiftDto made = await handler.CreateAsync(
            Save(null, autoClock: false), Build.UserId, CancellationToken.None);

        Assert.False(made.auto_clock);
        Assert.Empty(made.week_hours);
    }

    [Theory]
    [InlineData(0)]
    [InlineData(8)]
    [InlineData(-1)]
    public async Task A_weekday_outside_the_week_is_refused(int weekday)
    {
        var (handler, _) = Handler();

        await Assert.ThrowsAsync<ValidationException>(() => handler.CreateAsync(
            Save([new WeekHoursDto(weekday, "13:00", "23:00")]),
            Build.UserId,
            CancellationToken.None));
    }

    [Fact]
    public async Task The_same_weekday_twice_is_refused()
    {
        var (handler, _) = Handler();

        await Assert.ThrowsAsync<ValidationException>(() => handler.CreateAsync(
            Save([new WeekHoursDto(5, "13:00", "23:00"), new WeekHoursDto(5, "11:00", "23:00")]),
            Build.UserId,
            CancellationToken.None));
    }

    [Theory]
    [InlineData("25:00", "23:00")]
    [InlineData("13:00", "evening")]
    [InlineData("13:00", "13:00")]
    public async Task A_span_that_is_no_span_is_refused(string start, string end)
    {
        var (handler, _) = Handler();

        await Assert.ThrowsAsync<ValidationException>(() => handler.CreateAsync(
            Save([new WeekHoursDto(5, start, end)]),
            Build.UserId,
            CancellationToken.None));
    }

    [Fact]
    public async Task The_break_has_to_fit_inside_every_weekday()
    {
        var (handler, _) = Handler();

        await Assert.ThrowsAsync<ValidationException>(() => handler.CreateAsync(
            Save([new WeekHoursDto(5, "18:00", "19:00")], breakMinutes: 60),
            Build.UserId,
            CancellationToken.None));
    }

    [Fact]
    public async Task A_longer_break_from_an_older_client_is_held_to_the_weekdays_it_cannot_see()
    {
        var (handler, _) = Handler();

        ShiftDto made = await handler.CreateAsync(
            Save([new WeekHoursDto(5, "18:00", "19:00")]), Build.UserId, CancellationToken.None);

        await Assert.ThrowsAsync<ValidationException>(() => handler.UpdateAsync(
            Save(null, breakMinutes: 60), Build.UserId, made.id, CancellationToken.None));
    }

    [Fact]
    public async Task A_save_that_says_nothing_leaves_the_weekdays_and_the_clock_alone()
    {
        var (handler, _) = Handler();

        ShiftDto made = await handler.CreateAsync(
            Save([new WeekHoursDto(5, "11:00", "23:00")], autoClock: false),
            Build.UserId,
            CancellationToken.None);

        ShiftDto kept = await handler.UpdateAsync(
            Save(null), Build.UserId, made.id, CancellationToken.None);

        Assert.Single(kept.week_hours);
        Assert.False(kept.auto_clock);
    }

    [Fact]
    public async Task An_empty_list_clears_the_weekdays()
    {
        var (handler, _) = Handler();

        ShiftDto made = await handler.CreateAsync(
            Save([new WeekHoursDto(5, "11:00", "23:00")]), Build.UserId, CancellationToken.None);

        ShiftDto cleared = await handler.UpdateAsync(
            Save([]), Build.UserId, made.id, CancellationToken.None);

        Assert.Empty(cleared.week_hours);
    }

    // ==== Placements following a template ====

    private static readonly Shift Old = Build.Template(7, start: "11:00", end: "22:00");

    /// <summary>The same template with Fridays moved an hour later.</summary>
    private static Shift Newer()
    {
        Shift shift = Build.Template(7, start: "11:00", end: "22:00");

        shift.WeekHours = [Hours(5, "11:00", "23:00")];

        return shift;
    }

    private static DayShift Waiting(DateOnly date) => DayShift.From(Old, worked: false, date);

    private static bool Follow(DayShift entry, DateOnly date, DateOnly? today = null)
        => DayShiftEdit.FollowHours(entry, date, today ?? Monday, Old, Newer());

    [Fact]
    public void A_shift_still_waiting_on_the_old_hours_follows_the_new_ones()
    {
        DayShift entry = Waiting(Friday);

        Assert.True(Follow(entry, Friday));
        Assert.Equal(new TimeOnly(23, 0), entry.EndTime);
    }

    [Fact]
    public void Today_still_counts()
    {
        DayShift entry = Waiting(Friday);

        Assert.True(Follow(entry, Friday, today: Friday));
    }

    [Fact]
    public void A_date_already_behind_us_stays_as_it_was()
    {
        DayShift entry = Waiting(Friday);

        Assert.False(Follow(entry, Friday, today: Saturday));
        Assert.Equal(new TimeOnly(22, 0), entry.EndTime);
    }

    [Fact]
    public void A_weekday_the_edit_did_not_touch_reports_no_change()
    {
        DayShift entry = Waiting(Monday);

        Assert.False(Follow(entry, Monday));
        Assert.Equal(new TimeOnly(22, 0), entry.EndTime);
    }

    [Fact]
    public void A_shift_timed_on_purpose_is_left_where_it_was_put()
    {
        // A rota entry: the template priced it, the manager timed it. It sits
        // on neither the old hours nor the new, and nothing here outranks them.
        DayShift entry = Waiting(Friday);

        entry.StartTime = new TimeOnly(15, 0);
        entry.EndTime = new TimeOnly(21, 30);

        Assert.False(Follow(entry, Friday));
        Assert.Equal(new TimeOnly(15, 0), entry.StartTime);
        Assert.Equal(new TimeOnly(21, 30), entry.EndTime);
    }

    [Fact]
    public void A_worked_shift_is_history_however_recent()
    {
        DayShift entry = Waiting(Friday);

        entry.Worked = true;

        Assert.False(Follow(entry, Friday));
    }

    [Fact]
    public void Any_recorded_edge_keeps_it_where_it_is()
    {
        DayShift started = Waiting(Friday);
        DayShift ending = Waiting(Friday);

        started.ActualStart = new TimeOnly(10, 50);
        ending.ActualEnd = new TimeOnly(22, 30);

        Assert.False(Follow(started, Friday));
        Assert.False(Follow(ending, Friday));
    }

    [Fact]
    public void A_shift_the_close_has_spoken_about_keeps_its_hours()
    {
        DayShift entry = Waiting(Friday);

        entry.AutoClosedAtUtc = new DateTime(2026, 11, 2, 9, 0, 0, DateTimeKind.Utc);

        Assert.False(Follow(entry, Friday));
    }

    [Fact]
    public async Task An_update_moves_the_day_and_tells_it_so_with_its_version()
    {
        var (handler, query) = Handler();

        ShiftDto made = await handler.CreateAsync(Save(null), Build.UserId, CancellationToken.None);

        Shift template = query.Shifts.Single();

        Day moved = new() { UserId = Build.UserId, Date = Friday, Version = 3, Shifts = [DayShift.From(template, false, Friday)] };
        Day past = new() { UserId = Build.UserId, Date = Friday.AddDays(-7), Version = 3, Shifts = [DayShift.From(template, false, Friday.AddDays(-7))] };
        Day same = new() { UserId = Build.UserId, Date = Monday.AddDays(7), Version = 3, Shifts = [DayShift.From(template, false, Monday.AddDays(7))] };

        query.Days.AddRange([moved, past, same]);

        await handler.UpdateAsync(
            Save([new WeekHoursDto(5, "11:00", "23:00")]), Build.UserId, made.id, CancellationToken.None);

        Assert.Equal(new TimeOnly(23, 0), moved.Shifts![0].EndTime);
        Assert.Equal(4, moved.Version);

        // Behind today, and on a weekday the edit did not reach.
        Assert.Equal(new TimeOnly(22, 0), past.Shifts![0].EndTime);
        Assert.Equal(3, past.Version);
        Assert.Equal(3, same.Version);
    }
}
