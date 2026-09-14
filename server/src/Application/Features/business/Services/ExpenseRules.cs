using Shifter.Application.Features.business.DTOs;
using Shifter.Domain.Entities;

namespace Shifter.Application.Features.business.Services;

/// <summary>What an expense is allowed to say about itself, and what it adds up to.</summary>
public static class ExpenseRules
{
    /// <summary>The kinds.</summary>
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

    /// <summary>What share of the tips the travelling ate.</summary>
    public static decimal? TravelShareOfTips(IEnumerable<WorkExpense> expenses, decimal tips)
    {
        if (tips <= 0m) return null;

        decimal travel = expenses
            .Where(entry => entry.Kind == "transport")
            .Sum(entry => entry.Amount);

        return travel <= 0m ? null : Math.Round(travel * 100m / tips, 1);
    }
}
