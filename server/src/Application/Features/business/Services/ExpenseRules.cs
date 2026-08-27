using Shifter.Application.Features.business.DTOs;
using Shifter.Domain.Entities;

namespace Shifter.Application.Features.business.Services;

/// <summary>What an expense is allowed to say about itself, and what it adds up to.</summary>
public static class ExpenseRules
{
    /// <summary>
    /// The kinds. Anything unrecognised reads as "other" rather than being
    /// refused: a client that has not heard of a kind should still be able to
    /// record that money left.
    /// </summary>
    public static string ParseKind(string? value) => value?.ToLowerInvariant() switch
    {
        "transport" => "transport",
        "uniform" => "uniform",
        "tools" => "tools",
        "food" => "food",
        "training" => "training",
        _ => "other",
    };

    /// <summary>Expenses grouped by kind over a range, largest first.</summary>
    public static ExpenseKindDto[] ByKind(IEnumerable<WorkExpense> expenses)
        => expenses
            .Where(entry => entry.Amount > 0m)
            .GroupBy(entry => entry.Kind)
            .Select(group => new ExpenseKindDto(
                group.Key,
                group.Sum(entry => entry.Amount),
                group.Count()))
            .OrderByDescending(entry => entry.amount)
            .ThenBy(entry => entry.kind)
            .ToArray();

    /// <summary>
    /// What share of the tips the travelling ate. Only transport, and only
    /// against tips: "ночное такси съело 12% чаевых" is a sentence somebody
    /// can act on, where "expenses were 8% of earnings" is a statistic.
    ///
    /// Null when there were no tips to eat into — a percentage of nothing is
    /// not a large number, it is an undefined one.
    /// </summary>
    public static decimal? TravelShareOfTips(IEnumerable<WorkExpense> expenses, decimal tips)
    {
        if (tips <= 0m) return null;

        decimal travel = expenses
            .Where(entry => entry.Kind == "transport")
            .Sum(entry => entry.Amount);

        return travel <= 0m ? null : Math.Round(travel * 100m / tips, 1);
    }
}
