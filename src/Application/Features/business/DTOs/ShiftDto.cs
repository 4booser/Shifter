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
    double hours,
    int? location_id,
    string? location_name,
    string? location_colour,
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
    decimal? salary_amount
    );
