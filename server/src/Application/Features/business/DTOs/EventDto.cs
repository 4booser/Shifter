namespace Shifter.Application.Features.business.DTOs;

/// <summary>
/// An event as the calendar reads it. The only money here points outward:
/// events mark time and sometimes cost, shifts are what pays.
/// </summary>
public record EventDto(
    int id,
    string name,
    string? symbol,
    string colour,
    DateOnly start_date,
    /// <summary>Inclusive. Equal to start_date for a single day.</summary>
    DateOnly end_date,
    /// <summary>"HH:mm", or null for an all-day event.</summary>
    string? start_time,
    string? end_time,
    string? note,
    /// <summary>"ordinary" | "vacation" | "sick" | "dayoff".</summary>
    string kind,
    /// <summary>How many days it covers, both ends included.</summary>
    int days,
    /// <summary>Monday-first weekday numbers, comma-joined; null = one-off.</summary>
    string? repeat_weekdays = null,
    DateOnly? repeat_until = null,
    /// <summary>What it cost, per occurrence. Never inside anything earned.</summary>
    decimal cost = 0,
    /// <summary>The palette entry it came from, for grouping a year's lessons.</summary>
    int? template_id = null
    );

/// <summary>
/// What the client sends to create or replace an event. A single day is sent
/// with both dates equal rather than with the end left out, so the server never
/// has to guess which case it is looking at.
/// </summary>
public record EventSaveDto(
    string name,
    string? symbol,
    string colour,
    DateOnly start_date,
    DateOnly end_date,
    string? start_time,
    string? end_time,
    string? note,
    string? kind = null,
    string? repeat_weekdays = null,
    DateOnly? repeat_until = null,
    decimal cost = 0,
    int? template_id = null
    );
