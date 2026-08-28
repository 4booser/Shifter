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
    string stream = "all",
    /// <summary>settlement, advance, bonus or cash.</summary>
    string kind = "settlement"
    );

/// <summary>
/// The dates are nullable so that "not sent" and "sent wrong" stay different
/// answers. As plain DateOnly they deserialised to 0001-01-01 when a client
/// left one out, and the handler stored it: a payment recorded on a day that
/// does not exist, invisible to every reconciliation because its period sits
/// two thousand years before any work.
/// </summary>
public record PayoutCreateDto(
    DateOnly? period_from,
    DateOnly? period_to,
    decimal amount,
    DateOnly? received_on,
    string? note,
    int? location_id,
    /// <summary>Absent means the payment covers everything the place owes.</summary>
    string? stream = null,
    /// <summary>Absent means the payment closes the period, as it always did.</summary>
    string? kind = null
    );
