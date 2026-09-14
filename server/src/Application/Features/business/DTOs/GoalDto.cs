namespace Shifter.Application.Features.business.DTOs;

/// <summary>An amount to aim for.</summary>
public record GoalItemDto(
    int id,
    string period,
    decimal amount,
    DateOnly? anchor,
    string? note,
    /// <summary>The stretch this goal governs right now, for the client to label it.</summary>
    DateOnly current_from,
    DateOnly current_to
    );

public record GoalSaveDto(
    string period,
    decimal amount,
    /// <summary>Any date inside the period being named; absent means the standing goal for that period.</summary>
    DateOnly? anchor,
    string? note
    );
