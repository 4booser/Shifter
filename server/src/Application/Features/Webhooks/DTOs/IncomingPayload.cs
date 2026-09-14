namespace Shifter.Application.Features.Webhooks.DTOs;

/// <summary>One sold position as a delivery describes it.</summary>
public sealed record SalesLine(int? SalesId, string? Name, int Quantity);

/// <summary>A day's takings, read out of a delivery and not yet checked against the account.</summary>
public sealed record SalesPayload(
    DateOnly Date,
    string? ExternalId,
    decimal? Tips,
    decimal? TipsCash,
    decimal? Deductions,
    string? Note,
    /// <summary>The delivery is the whole truth for the day: positions it does not mention are cleared off.</summary>
    bool Replace,
    SalesLine[] Lines,
    /// <summary>Whether the payload had a positions field at all, as opposed to one that was there and empty.</summary>
    bool SawPositions);

/// <summary>Hours worked on one day.</summary>
public sealed record HoursPayload(
    DateOnly Date,
    string? ExternalId,
    /// <summary>Names the template. Null falls back to the endpoint's default.</summary>
    string? Shift,
    TimeOnly? Start,
    TimeOnly? End,
    double? Hours,
    int? BreakMinutes,
    /// <summary>Whether this was worked or is still a plan.</summary>
    bool Worked,
    /// <summary>Whether the payload said anything about time at all.</summary>
    bool SawTime);
