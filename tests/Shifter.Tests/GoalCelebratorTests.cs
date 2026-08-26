using Shifter.Application.Features.business.Services;
using Shifter.Domain.Entities;

using Xunit;

namespace Shifter.Tests;

public class GoalCelebratorTests
{
    private static Goal Monthly(decimal amount, DateOnly? celebrated = null) => new()
    {
        Id = 1,
        UserId = 1,
        Period = GoalPeriod.Month,
        Amount = amount,
        CelebratedOn = celebrated,
    };

    [Fact]
    public void A_fresh_goal_is_a_candidate_with_its_period_bounds()
    {
        var list = GoalCelebrator.Candidates([Monthly(40_000)], new DateOnly(2026, 8, 26)).ToArray();

        Assert.Single(list);
        Assert.Equal(new DateOnly(2026, 8, 1), list[0].From);
        Assert.Equal(new DateOnly(2026, 8, 31), list[0].To);
    }

    [Fact]
    public void A_goal_already_cheered_this_period_stays_silent()
    {
        var goal = Monthly(40_000, celebrated: new DateOnly(2026, 8, 1));

        Assert.Empty(GoalCelebrator.Candidates([goal], new DateOnly(2026, 8, 26)));
    }

    [Fact]
    public void Last_months_cheer_does_not_gag_this_month()
    {
        var goal = Monthly(40_000, celebrated: new DateOnly(2026, 7, 1));

        Assert.Single(GoalCelebrator.Candidates([goal], new DateOnly(2026, 8, 26)));
    }

    [Fact]
    public void Day_week_and_month_goals_are_all_watched_at_once()
    {
        Goal[] goals =
        [
            new() { Id = 1, UserId = 1, Period = GoalPeriod.Day, Amount = 1000 },
            new() { Id = 2, UserId = 1, Period = GoalPeriod.Week, Amount = 5000 },
            new() { Id = 3, UserId = 1, Period = GoalPeriod.Month, Amount = 40_000 },
        ];

        Assert.Equal(3, GoalCelebrator.Candidates(goals, new DateOnly(2026, 8, 26)).Count());
    }

    [Fact]
    public void A_year_goal_is_left_to_cheaper_machinery()
    {
        Goal[] goals = [new() { Id = 1, UserId = 1, Period = GoalPeriod.Year, Amount = 300_000 }];

        Assert.Empty(GoalCelebrator.Candidates(goals, new DateOnly(2026, 8, 26)));
    }

    [Theory]
    [InlineData(39_999, false)]
    [InlineData(40_000, true)]
    [InlineData(41_000, true)]
    public void The_line_is_crossed_at_the_amount_itself(decimal earned, bool expected)
        => Assert.Equal(expected, GoalCelebrator.Crossed(Monthly(40_000), earned));
}
