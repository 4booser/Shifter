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
    string? location_name);

public record ExpenseCreateDto(
    DateOnly date,
    decimal amount,
    string? kind,
    string? note,
    int? location_id);
