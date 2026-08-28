namespace Shifter.Application.Features.business.DTOs;

/// <summary>
/// One place somebody has worked, as a line of a CV. The rate rather than the
/// total: what an hour was worth is the number an employer reads, and what the
/// year came to is nobody else's business.
/// </summary>
public record WorkHistoryPlaceDto(
    string name,
    /// <summary>yyyy-MM.</summary>
    string from,
    string to,
    int shifts,
    double hours,
    /// <summary>Null unless the person asked for money to be shown.</summary>
    decimal? per_hour,
    string currency);

/// <summary>
/// A biography made of shifts. Every figure comes from days that were actually
/// recorded, which is what makes it worth showing to somebody with no reason to
/// believe you.
/// </summary>
public record WorkHistoryDto(
    int shifts,
    double hours,
    /// <summary>Months from the first recorded shift to the last, both ends counted.</summary>
    int months,
    /// <summary>yyyy-MM, or null where nothing has been recorded.</summary>
    string? first_month,
    string? last_month,
    WorkHistoryPlaceDto[] places,
    /// <summary>The shift names worked most — the nearest thing here to a job title.</summary>
    string[] roles);
