using Shifter.Domain.Entities;

using Xunit;

namespace Shifter.Tests;

/// <summary>
/// The streak arithmetic and the fatigue comparison.
///
/// Both feed sentences the brief says out loud, and a wrong position — a
/// streak that survives a gap, a fresh day counted as deep — turns a
/// constatation into a lie with a number on it.
/// </summary>
public sealed class RhythmTests
{
    private static DateOnly D(int day) => new(2026, 3, day);

    [Fact]
    public void A_gap_starts_the_count_over()
    {
        var positions = WorkStreaks.Positions([D(1), D(2), D(3), D(5), D(6)]);

        Assert.Equal(1, positions[D(1)]);
        Assert.Equal(3, positions[D(3)]);
        // The 4th was off, so the 5th is a first day again.
        Assert.Equal(1, positions[D(5)]);
        Assert.Equal(2, positions[D(6)]);
    }

    [Fact]
    public void The_current_streak_survives_a_morning_read()
    {
        DateOnly[] worked = [D(10), D(11), D(12), D(13)];

        // Read in the evening of a worked day: four and counting.
        Assert.Equal(4, WorkStreaks.Current(worked, D(13)));

        // Read the next morning, before any shift: still four — the streak
        // is alive until a day actually passes without work.
        Assert.Equal(4, WorkStreaks.Current(worked, D(14)));

        // A full day off ends it.
        Assert.Equal(0, WorkStreaks.Current(worked, D(15)));
    }

    [Fact]
    public void The_record_is_the_longest_run_not_the_latest()
    {
        DateOnly[] worked = [D(1), D(2), D(3), D(4), D(5), D(10), D(11)];

        Assert.Equal(5, WorkStreaks.Longest(worked));
    }

    [Fact]
    public void Too_few_deep_days_is_silence_not_a_smaller_font()
    {
        // Plenty of fresh days, three deep ones: no verdict.
        var days = new List<FatigueEffect.DayFigures>();

        for (var i = 0; i < 10; i++)
            days.Add(new(new DateOnly(2026, 1, 1).AddDays(i * 3), 200m, 8));

        // One run of 8: positions 1..8 → two fresh (1,2), three deep (6,7,8).
        for (var i = 0; i < 8; i++)
            days.Add(new(new DateOnly(2026, 3, 1).AddDays(i), 200m, 8));

        Assert.Null(FatigueEffect.Read(days));
    }

    [Fact]
    public void Deep_days_running_lower_is_read_and_said_as_a_percentage()
    {
        var days = new List<FatigueEffect.DayFigures>();

        // Eight two-day runs: sixteen fresh days at 25/h. The long runs
        // below add their own days one and two — fresh is a position, not a
        // kind of week — for twenty-four fresh days in all.
        for (var i = 0; i < 8; i++)
        {
            var start = new DateOnly(2026, 1, 1).AddDays(i * 4);

            days.Add(new(start, 200m, 8));
            days.Add(new(start.AddDays(1), 200m, 8));
        }

        // Four seven-day runs: eight deep days (positions 6 and 7) at 20/h.
        for (var i = 0; i < 4; i++)
        {
            var start = new DateOnly(2026, 5, 1).AddDays(i * 10);

            for (var offset = 0; offset < 7; offset++)
                days.Add(new(start.AddDays(offset), offset >= 5 ? 160m : 200m, 8));
        }

        var verdict = FatigueEffect.Read(days);

        Assert.NotNull(verdict);
        Assert.Equal(24, verdict.FreshDays);
        Assert.Equal(8, verdict.DeepDays);
        Assert.Equal(25m, verdict.FreshPerHour);
        Assert.Equal(20m, verdict.DeepPerHour);
        Assert.Equal(-20, verdict.Percent);
        Assert.True(verdict.IsNoticeable);
    }

    [Fact]
    public void A_two_percent_wiggle_is_not_noticeable()
    {
        var days = new List<FatigueEffect.DayFigures>();

        for (var i = 0; i < 8; i++)
        {
            var start = new DateOnly(2026, 1, 1).AddDays(i * 4);

            days.Add(new(start, 200m, 8));
            days.Add(new(start.AddDays(1), 200m, 8));
        }

        for (var i = 0; i < 4; i++)
        {
            var start = new DateOnly(2026, 5, 1).AddDays(i * 10);

            for (var offset = 0; offset < 7; offset++)
                days.Add(new(start.AddDays(offset), offset >= 5 ? 196m : 200m, 8));
        }

        var verdict = FatigueEffect.Read(days);

        Assert.NotNull(verdict);
        Assert.False(verdict.IsNoticeable);
    }

    [Fact]
    public void A_weekly_goal_streak_counts_back_and_survives_an_open_week()
    {
        // Mondays: three consecutive closed weeks before the current one.
        DateOnly[] closed = [new(2026, 3, 2), new(2026, 3, 9), new(2026, 3, 16)];

        // Thursday of the NEXT week: the current week is still open, and an
        // open current week must not break the run.
        Assert.Equal(3, GoalStreaks.Weekly(closed, new DateOnly(2026, 3, 26)));

        // The current week already closed joins the run.
        Assert.Equal(4, GoalStreaks.Weekly([.. closed, new DateOnly(2026, 3, 23)], new DateOnly(2026, 3, 26)));

        // A whole week missed ends it.
        Assert.Equal(0, GoalStreaks.Weekly(closed, new DateOnly(2026, 4, 9)));
    }
}

