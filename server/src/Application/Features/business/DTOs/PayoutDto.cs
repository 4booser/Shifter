namespace Shifter.Application.Features.business.DTOs;

public record PayoutDto(
    int id,
    DateOnly period_from,
    DateOnly period_to,
    decimal amount,
    DateOnly received_on,
    string? note,
    /// <summary>Null when the payment was not attributed to a place.</summary>
    int? location_id,
    string? location_name,
    /// <summary>Which of the place's payments this settles: all, wage or commission.</summary>
    string stream = "all"
    );

public record PayoutCreateDto(
    DateOnly period_from,
    DateOnly period_to,
    decimal amount,
    DateOnly received_on,
    string? note,
    int? location_id,
    /// <summary>Absent means the payment covers everything the place owes.</summary>
    string? stream = null
    );
