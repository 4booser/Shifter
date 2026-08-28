using Shifter.Application.Common.Exceptions;
using Shifter.Application.Features.business.DTOs;
using Shifter.Application.Features.business.Services;
using Shifter.Domain.Entities;

using Xunit;

namespace Shifter.Tests;

/// <summary>
/// A travel pass, a locker, the whip-round for the staff room. Nobody records
/// these, because recording something is what you do while thinking about it,
/// and the nature of a standing cost is that you are not.
///
/// The occurrences are conjured from the rule at read time rather than written
/// by a scheduler — the same choice the calendar makes for a repeating event,
/// and for the same reasons: nothing to run, nothing to run twice, and a rule
/// edited in June does not rewrite May.
/// </summary>
public class ExpenseRuleTests
{
    private static readonly DateOnly Today = new(2026, 8, 28);

    private static (ExpenseHandler Handler, FakeShifterQuery Query) Made()
    {
        var query = new FakeShifterQuery();

        return (new ExpenseHandler(new FakeShifterCommand(query), query), query);
    }

    private static ExpenseRuleSaveDto Pass(
        decimal amount = 900m,
        string period = "month",
        int day = 5,
        int weekday = 0,
        string starts = "2026-06-01",
        string? ends = null)
        => new(
            amount,
            "transport",
            "Проездной",
            period,
            day,
            weekday,
            DateOnly.Parse(starts),
            ends is null ? null : DateOnly.Parse(ends),
            null);

    [Fact]
    public async Task A_monthly_cost_shows_up_on_its_day_without_being_written()
    {
        var (handler, _) = Made();

        await handler.CreateRuleAsync(Pass(), Build.UserId, Today, CancellationToken.None);

        var rows = await handler.ListAsync(
            Build.UserId, new DateOnly(2026, 8, 1), new DateOnly(2026, 8, 31), CancellationToken.None);

        var only = Assert.Single(rows);

        Assert.Equal(new DateOnly(2026, 8, 5), only.date);
        Assert.Equal(900m, only.amount);
        // An estimate never mixes with a fact.
        Assert.True(only.expected);
    }

    [Fact]
    public async Task A_conjured_one_carries_no_database_id_to_delete()
    {
        var (handler, _) = Made();

        await handler.CreateRuleAsync(Pass(), Build.UserId, Today, CancellationToken.None);

        var rows = await handler.ListAsync(
            Build.UserId, new DateOnly(2026, 8, 1), new DateOnly(2026, 8, 31), CancellationToken.None);

        // Nothing was written, so there is nothing to delete — and the id
        // cannot collide with a row that does exist.
        Assert.True(rows[0].id < 0);
        Assert.NotNull(rows[0].rule_id);
    }

    [Fact]
    public async Task A_confirmed_expense_stands_in_for_the_prediction()
    {
        var (handler, query) = Made();

        var rule = await handler.CreateRuleAsync(Pass(), Build.UserId, Today, CancellationToken.None);

        // What actually happened: it cost 950 this month.
        query.Expenses.Add(new WorkExpense
        {
            Id = 1,
            UserId = Build.UserId,
            Date = new DateOnly(2026, 8, 5),
            Amount = 950m,
            Kind = "transport",
            Note = "Проездной",
            RuleId = rule.id,
        });

        var rows = await handler.ListAsync(
            Build.UserId, new DateOnly(2026, 8, 1), new DateOnly(2026, 8, 31), CancellationToken.None);

        var only = Assert.Single(rows);

        Assert.Equal(950m, only.amount);
        Assert.False(only.expected);
    }

    [Fact]
    public async Task One_month_off_is_not_the_end_of_the_rule()
    {
        var (handler, _) = Made();

        var rule = await handler.CreateRuleAsync(Pass(), Build.UserId, Today, CancellationToken.None);

        await handler.SkipAsync(
            Build.UserId, rule.id, new DateOnly(2026, 8, 5), skipped: true, Today, CancellationToken.None);

        var august = await handler.ListAsync(
            Build.UserId, new DateOnly(2026, 8, 1), new DateOnly(2026, 8, 31), CancellationToken.None);
        var september = await handler.ListAsync(
            Build.UserId, new DateOnly(2026, 9, 1), new DateOnly(2026, 9, 30), CancellationToken.None);

        Assert.Empty(august);
        // Back by itself next month, which is what "skip" means and not what
        // deleting would have done.
        Assert.Single(september);
    }

    [Fact]
    public async Task A_month_put_back_is_due_again()
    {
        var (handler, _) = Made();

        var rule = await handler.CreateRuleAsync(Pass(), Build.UserId, Today, CancellationToken.None);
        var day = new DateOnly(2026, 8, 5);

        await handler.SkipAsync(Build.UserId, rule.id, day, true, Today, CancellationToken.None);
        var back = await handler.SkipAsync(Build.UserId, rule.id, day, false, Today, CancellationToken.None);

        Assert.Empty(back.skipped);
        Assert.Single(await handler.ListAsync(
            Build.UserId, new DateOnly(2026, 8, 1), new DateOnly(2026, 8, 31), CancellationToken.None));
    }

    [Fact]
    public async Task A_weekly_cost_lands_on_its_weekday()
    {
        var (handler, _) = Made();

        // Monday = 0. August 2026 begins on a Saturday.
        await handler.CreateRuleAsync(
            Pass(amount: 200m, period: "week", weekday: 0, starts: "2026-08-01"),
            Build.UserId, Today, CancellationToken.None);

        var rows = await handler.ListAsync(
            Build.UserId, new DateOnly(2026, 8, 1), new DateOnly(2026, 8, 31), CancellationToken.None);

        Assert.Equal(5, rows.Length);
        Assert.All(rows, row => Assert.Equal(DayOfWeek.Monday, row.date.DayOfWeek));
    }

    [Fact]
    public async Task Nothing_is_due_before_it_started_or_after_it_ended()
    {
        var (handler, _) = Made();

        await handler.CreateRuleAsync(
            Pass(starts: "2026-08-01", ends: "2026-08-31"), Build.UserId, Today, CancellationToken.None);

        Assert.Empty(await handler.ListAsync(
            Build.UserId, new DateOnly(2026, 7, 1), new DateOnly(2026, 7, 31), CancellationToken.None));
        Assert.Empty(await handler.ListAsync(
            Build.UserId, new DateOnly(2026, 9, 1), new DateOnly(2026, 9, 30), CancellationToken.None));
    }

    [Fact]
    public async Task Two_rhythms_are_compared_by_what_they_cost_a_month()
    {
        var (handler, _) = Made();

        var weekly = await handler.CreateRuleAsync(
            Pass(amount: 200m, period: "week"), Build.UserId, Today, CancellationToken.None);

        // Fifty-two weeks over twelve months, not four weeks — the second is
        // out by a month's worth over a year.
        Assert.Equal(866.67m, weekly.monthly);
    }

    [Fact]
    public async Task The_day_of_the_month_stops_at_twenty_eight()
    {
        var (handler, _) = Made();

        // The 31st would skip February, and a rule that quietly skips a month
        // is worse than one that asks for a day every month has.
        await Assert.ThrowsAsync<ValidationException>(() =>
            handler.CreateRuleAsync(Pass(day: 31), Build.UserId, Today, CancellationToken.None));
    }

    [Fact]
    public async Task A_standing_cost_has_to_say_what_it_is()
    {
        var (handler, _) = Made();

        await Assert.ThrowsAsync<ValidationException>(() =>
            handler.CreateRuleAsync(
                new ExpenseRuleSaveDto(900m, "transport", "  ", "month", 5, 0, Today, null, null),
                Build.UserId, Today, CancellationToken.None));
    }

    [Fact]
    public async Task Stopping_it_leaves_the_months_that_were_paid()
    {
        var (handler, query) = Made();

        var rule = await handler.CreateRuleAsync(Pass(), Build.UserId, Today, CancellationToken.None);

        query.Expenses.Add(new WorkExpense
        {
            Id = 1,
            UserId = Build.UserId,
            Date = new DateOnly(2026, 7, 5),
            Amount = 900m,
            Kind = "transport",
            RuleId = rule.id,
        });

        await handler.DeleteRuleAsync(Build.UserId, rule.id, CancellationToken.None);

        var july = await handler.ListAsync(
            Build.UserId, new DateOnly(2026, 7, 1), new DateOnly(2026, 7, 31), CancellationToken.None);

        var kept = Assert.Single(july);

        Assert.Equal(900m, kept.amount);
        Assert.False(kept.expected);
    }

    [Fact]
    public async Task The_rules_are_the_callers_own()
    {
        var (handler, query) = Made();

        query.ExpenseRules.Add(new ExpenseRule
        {
            Id = 7, UserId = Build.UserId + 1, Note = "Чужое", Amount = 100m,
        });

        Assert.Empty(await handler.RulesAsync(Build.UserId, Today, CancellationToken.None));
        await Assert.ThrowsAsync<NotFoundException>(() =>
            handler.DeleteRuleAsync(Build.UserId, 7, CancellationToken.None));
    }
}
