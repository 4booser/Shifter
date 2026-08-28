namespace Shifter.Application.Features.business.DTOs;

/// <summary>
/// A palette entry for the calendar's non-working side: «английский»,
/// «вождение», the gym. Money here points outward — it is what the thing
/// costs, and it is never added to anything the week earned.
/// </summary>
public record EventTemplateDto(
    int id,
    string name,
    string? symbol,
    string colour,
    /// <summary>"ordinary" | "vacation" | "sick" | "dayoff".</summary>
    string kind,
    /// <summary>"HH:mm", or null when the day is simply marked.</summary>
    string? start_time,
    string? end_time,
    /// <summary>What one costs. Null is "not counted", which is not zero.</summary>
    decimal? cost,
    bool archived,
    /// <summary>Hours between the two times; 0 when the event has none.</summary>
    double hours);

public record EventTemplateSaveDto(
    string name,
    string? symbol,
    string colour,
    string? kind = null,
    string? start_time = null,
    string? end_time = null,
    decimal? cost = null);
