using Shifter.Domain.Entities;

using Xunit;

namespace Shifter.Tests;

public class GoalCalculatorTests
{
    private static Goal Standing(GoalPeriod period, decimal amount)
        => new Goal { Id = 1, UserId = Build.UserId, Period = period, Amount = amount };

    private static Goal Specific(GoalPeriod period, decimal amount, string anchor)
        => new Goal
        {
            Id = 2,
            UserId = Build.UserId,
            Period = period,
            Amount = amount,
            Anchor = DateOnly.Parse(anchor),
        };

    [Fact]
    public void AMonthRunsFromTheFirstToTheLast()
    {
        var (from, to) = GoalCalculator.PeriodFor(GoalPeriod.Month, new DateOnly(2026, 2, 17));

        Assert.Equal(new DateOnly(2026, 2, 1), from);
        Assert.Equal(new DateOnly(2026, 2, 28), to);
    }

    [Fact]
    public void AWeekStartsOnMonday()
    {
        // 2026-08-22 is a Saturday.
        var (from, to) = GoalCalculator.PeriodFor(GoalPeriod.Week, new DateOnly(2026, 8, 22));

        Assert.Equal(new DateOnly(2026, 8, 17), from);
        Assert.Equal(new DateOnly(2026, 8, 23), to);
    }

    [Fact]
    public void AStandingGoalGovernsEveryPeriod()
    {
        Goal[] goals = [Standing(GoalPeriod.Month, 30_000)];

        Assert.Equal(30_000, GoalCalculator.ResolveFor(goals, GoalPeriod.Month, new DateOnly(2026, 3, 9))?.Amount);
        Assert.Equal(30_000, GoalCalculator.ResolveFor(goals, GoalPeriod.Month, new DateOnly(2026, 11, 30))?.Amount);
    }

    [Fact]
    public void OneMonthsOwnGoalBeatsTheStandingOne()
    {
        // The whole reason for writing down "45 000 this December" is that it
        // should win over "30 000 a month".
        Goal[] goals = [Standing(GoalPeriod.Month, 30_000), Specific(GoalPeriod.Month, 45_000, "2026-12-01")];

        Assert.Equal(45_000, GoalCalculator.ResolveFor(goals, GoalPeriod.Month, new DateOnly(2026, 12, 20))?.Amount);
        Assert.Equal(30_000, GoalCalculator.ResolveFor(goals, GoalPeriod.Month, new DateOnly(2026, 11, 20))?.Amount);
    }

    [Fact]
    public void AnyDateInsideThePeriodNamesIt()
    {
        // The client may send the first of the month or the day on screen.
        Goal[] goals = [Specific(GoalPeriod.Month, 45_000, "2026-12-24")];

        Assert.Equal(45_000, GoalCalculator.ResolveFor(goals, GoalPeriod.Month, new DateOnly(2026, 12, 1))?.Amount);
    }

    [Fact]
    public void GoalsOfAnotherPeriodAreNotConsulted()
    {
        Goal[] goals = [Standing(GoalPeriod.Day, 2_000)];

        Assert.Null(GoalCalculator.ResolveFor(goals, GoalPeriod.Month, new DateOnly(2026, 3, 9)));
    }

    [Fact]
    public void ADailyGoalOverAMonthIsThatManyDays()
    {
        decimal? target = GoalCalculator.TargetOver(
            Standing(GoalPeriod.Day, 2_000), new DateOnly(2026, 4, 1), new DateOnly(2026, 4, 30));

        Assert.Equal(60_000, target);
    }

    [Fact]
    public void AMonthlyGoalOverAQuarterIsThreeMonths()
    {
        decimal? target = GoalCalculator.TargetOver(
            Standing(GoalPeriod.Month, 30_000), new DateOnly(2026, 1, 1), new DateOnly(2026, 3, 31));

        Assert.Equal(90_000, target);
    }

    [Fact]
    public void APartialMonthHasNoComparableTarget()
    {
        // Half a month is not half a monthly target in any sense a reader would
        // accept, so there is no figure rather than a prorated fiction.
        Assert.Null(GoalCalculator.TargetOver(
            Standing(GoalPeriod.Month, 30_000), new DateOnly(2026, 1, 1), new DateOnly(2026, 1, 20)));

        Assert.Null(GoalCalculator.TargetOver(
            Standing(GoalPeriod.Week, 8_000), new DateOnly(2026, 1, 1), new DateOnly(2026, 1, 4)));
    }

    [Fact]
    public void AYearlyGoalNeedsWholeYears()
    {
        Assert.Equal(500_000, GoalCalculator.TargetOver(
            Standing(GoalPeriod.Year, 500_000), new DateOnly(2026, 1, 1), new DateOnly(2026, 12, 31)));

        Assert.Null(GoalCalculator.TargetOver(
            Standing(GoalPeriod.Year, 500_000), new DateOnly(2026, 1, 1), new DateOnly(2026, 6, 30)));
    }
}
