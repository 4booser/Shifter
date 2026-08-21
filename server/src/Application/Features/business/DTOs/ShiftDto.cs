namespace Shifter.Application.Features.business.DTOs;

/// <summary>
/// A shift template as it goes out to the palette. salary_period is a word
/// rather than the enum's number so the payload stays readable: "hour", "day",
/// "week" or "month".
/// </summary>
public record ShiftDto(
    int id,
    string name,
    string? symbol,
    string start_time,
    string end_time,
    string salary_period,
    decimal? salary_amount,
    /// <summary>Unpaid minutes inside the shift; already taken off hours.</summary>
    int break_minutes,
    double hours,
    int? location_id,
    string? location_name,
    string? location_colour,
    /// <summary>The template's own colour, or null when it borrows the place's.</summary>
    string? colour,
    /// <summary>What the calendar should actually draw: own colour, else the place's.</summary>
    string? effective_colour,
    bool archived
    );

/// <summary>Create and update take the same fields. Times are "HH:mm".</summary>
public record ShiftCreateDto(
    string name,
    string? symbol,
    int? location_id,
    string start_time,
    string end_time,
    string salary_period,
    decimal? salary_amount,
    int break_minutes,
    /// <summary>
    /// "#RRGGBB", or null to go back to borrowing the place's colour. Defaulted
    /// so a client that predates the field does not clear it on every save.
    /// </summary>
    string? colour = null
    );
