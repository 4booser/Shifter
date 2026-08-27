using Shifter.Application.Features.business.DTOs;
using Shifter.Application.Features.business.Services;
using Shifter.Domain.Entities;

using Xunit;

namespace Shifter.Tests;

/// <summary>
/// What the work cost, as opposed to what the venue took. A fine is an argument
/// waiting to happen; a taxi home at four in the morning is just the job.
/// </summary>
public class ExpenseTests
{
    private static WorkExpense Spent(decimal amount, string kind, string date = "2026-03-10")
        => new WorkExpense
        {
            UserId = Build.UserId,
            Date = DateOnly.Parse(date),
            Amount = amount,
            Kind = kind,
        };

    [Fact]
    public void ExpensesAreGroupedByKindLargestFirst()
    {
        ExpenseKindDto[] split = ExpenseRules.ByKind([
            Spent(300m, "transport"),
            Spent(1_200m, "uniform"),
            Spent(400m, "transport"),
        ]);

        Assert.Equal(2, split.Length);
        Assert.Equal("uniform", split[0].kind);
        Assert.Equal(1_200m, split[0].amount);
        Assert.Equal("transport", split[1].kind);
        Assert.Equal(700m, split[1].amount);
        Assert.Equal(2, split[1].count);
    }

    [Fact]
    public void AKindNobodyHasHeardOfIsRecordedRatherThanRefused()
    {
        // Somebody spending money should never be stopped by a taxonomy.
        Assert.Equal("other", ExpenseRules.ParseKind("парковка"));
        Assert.Equal("other", ExpenseRules.ParseKind(null));
        Assert.Equal("transport", ExpenseRules.ParseKind("TRANSPORT"));
    }

    [Fact]
    public void TheTaxiHomeIsMeasuredAgainstTheTips()
    {
        // "Ночное такси съело 12% чаевых" is a sentence somebody can act on.
        // "Expenses were 8% of earnings" is a statistic.
        decimal? share = ExpenseRules.TravelShareOfTips(
            [Spent(600m, "transport"), Spent(2_000m, "uniform")],
            tips: 5_000m);

        Assert.Equal(12m, share);
    }

    [Fact]
    public void NoTipsMeansNoShareRatherThanAHugeOne()
    {
        // A percentage of nothing is undefined, not large — and printing an
        // enormous number for a week with no tips would be alarming nonsense.
        Assert.Null(ExpenseRules.TravelShareOfTips([Spent(600m, "transport")], tips: 0m));
    }

    [Fact]
    public void NoFaresMeansNothingToSay()
    {
        Assert.Null(ExpenseRules.TravelShareOfTips([Spent(600m, "uniform")], tips: 5_000m));
    }
}
