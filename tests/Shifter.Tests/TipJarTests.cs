using Shifter.Domain.Entities;

using Xunit;

namespace Shifter.Tests;

/// <summary>
/// Tips are the only money in this trade that arrives in cash and leaves
/// without a trace. "Save a bit" is advice nobody can follow, because a bit of
/// nothing in particular is nothing; a percent of a figure the app already has
/// is a number somebody can act on.
///
/// Nothing here moves any money, and nothing here promises a date it cannot
/// stand behind.
/// </summary>
public class TipJarTests
{
    private static readonly DateOnly Today = new(2026, 8, 29);

    [Fact]
    public void A_share_of_the_tips_is_what_should_be_in_the_jar()
    {
        var state = TipJar.Since(20m, goal: 0m, tipsSince: 8_400m, new DateOnly(2026, 7, 1), Today);

        Assert.Equal(8_400m, state.TipsSince);
        Assert.Equal(1_680m, state.Saved);
        Assert.Equal(59, state.Days);
    }

    [Fact]
    public void Off_means_off_rather_than_zero_percent_of_something()
    {
        var state = TipJar.Since(0m, 10_000m, 8_400m, new DateOnly(2026, 7, 1), Today);

        Assert.Equal(0m, state.Saved);
        Assert.Equal(0, state.Days);
    }

    [Fact]
    public void Nothing_is_counted_from_before_the_rule_existed()
    {
        // A counter that opens by declaring somebody already behind is a
        // counter they close. The day the rule starts is the day it counts
        // from, and the caller passes only the tips since then.
        var state = TipJar.Since(20m, 0m, 0m, null, Today);

        Assert.Equal(0m, state.Saved);
    }

    [Fact]
    public void A_pace_becomes_a_date_only_once_there_is_a_pace()
    {
        // Three days of tips extrapolated into a date months away is
        // arithmetic dressed up as a promise.
        var young = TipJar.Since(20m, 10_000m, 900m, Today.AddDays(-3), Today);

        Assert.Null(TipJar.Reaches(young, Today));
    }

    [Fact]
    public void With_a_fortnight_behind_it_the_date_is_worth_saying()
    {
        // Two thousand put aside over fifty days: forty a day, eight thousand
        // to go, two hundred days.
        var state = TipJar.Since(20m, 10_000m, 10_000m, Today.AddDays(-50), Today);

        var when = TipJar.Reaches(state, Today);

        Assert.NotNull(when);
        Assert.Equal(Today.AddDays(200), when);
    }

    [Fact]
    public void A_goal_already_reached_is_reached_today()
    {
        var state = TipJar.Since(50m, 1_000m, 4_000m, Today.AddDays(-30), Today);

        Assert.Equal(Today, TipJar.Reaches(state, Today));
    }

    [Fact]
    public void Five_years_out_is_not_a_forecast()
    {
        // At this pace the goal arrives in another life. Saying so with a date
        // would be worse than saying nothing.
        var state = TipJar.Since(1m, 1_000_000m, 10_000m, Today.AddDays(-30), Today);

        Assert.Null(TipJar.Reaches(state, Today));
    }

    [Fact]
    public void No_goal_means_a_total_and_no_date()
    {
        var state = TipJar.Since(20m, 0m, 8_400m, Today.AddDays(-60), Today);

        Assert.Equal(1_680m, state.Saved);
        Assert.Null(TipJar.Reaches(state, Today));
    }
}
