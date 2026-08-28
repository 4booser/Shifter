namespace Shifter.Application.Features.business.DTOs;

/// <summary>
/// One thing the work cost. Reported beside earnings, never inside them: what
/// arrived is what arrived, and this left afterwards.
/// </summary>
public record ExpenseDto(
    int id,
    DateOnly date,
    decimal amount,
    /// <summary>transport, uniform, tools, food, training or other.</summary>
    string kind,
    string? note,
    /// <summary>Null where it belongs to the trade rather than to an employer.</summary>
    int? location_id,
    string? location_name,
    /// <summary>
    /// True where nobody has confirmed it yet: the rule says it happens, and
    /// the day has not come or has not been checked. An estimate never mixes
    /// with a fact, so it is labelled rather than quietly counted as one.
    /// </summary>
    bool expected = false,
    /// <summary>The standing cost it came from, where it came from one.</summary>
    int? rule_id = null);

/// <summary>A cost that comes round, as the client states it.</summary>
public record ExpenseRuleSaveDto(
    decimal amount,
    string? kind,
    string note,
    /// <summary>"month" or "week".</summary>
    string? period,
    /// <summary>1..28 for a monthly rhythm.</summary>
    int day_of_month,
    /// <summary>Monday = 0, for a weekly one.</summary>
    int weekday,
    DateOnly starts_on,
    DateOnly? ends_on,
    int? location_id);

public record ExpenseRuleDto(
    int id,
    decimal amount,
    string kind,
    string note,
    string period,
    int day_of_month,
    int weekday,
    DateOnly starts_on,
    DateOnly? ends_on,
    int? location_id,
    string? location_name,
    /// <summary>Occurrences called off, so a screen can offer to put one back.</summary>
    DateOnly[] skipped,
    /// <summary>When it next falls due, or null once it has ended.</summary>
    DateOnly? next,
    /// <summary>What it comes to in a month, whatever its rhythm.</summary>
    decimal monthly);

public record ExpenseCreateDto(
    DateOnly date,
    decimal amount,
    string? kind,
    string? note,
    int? location_id);
