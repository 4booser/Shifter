namespace Shifter.Application.Features.business.DTOs;

public record PayoutDto(
    int id,
    DateOnly period_from,
    DateOnly period_to,
    decimal amount,
    DateOnly received_on,
    string? note
    );

public record PayoutCreateDto(
    DateOnly period_from,
    DateOnly period_to,
    decimal amount,
    DateOnly received_on,
    string? note
    );
