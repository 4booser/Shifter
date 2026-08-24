namespace Shifter.Application.Features.Webhooks.DTOs;

/// <summary>
/// One sold position as a delivery describes it. The catalogue position is
/// named rather than numbered wherever possible: a till knows its own item
/// names and knows nothing about this application's ids.
/// </summary>
public sealed record SalesLine(int? SalesId, string? Name, int Quantity);

/// <summary>
/// A day's takings, read out of a delivery and not yet checked against the
/// account. Every optional field is null when the payload did not carry it,
/// which is what keeps a partial delivery from erasing anything.
/// </summary>
public sealed record SalesPayload(
    DateOnly Date,
    string? ExternalId,
    decimal? Tips,
    decimal? TipsCash,
    decimal? Deductions,
    string? Note,
    /// <summary>
    /// The delivery is the whole truth for the day: positions it does not
    /// mention are cleared off. Off unless the payload asks for it, so a till
    /// reporting one item cannot wipe a day filled in by hand.
    /// </summary>
    bool Replace,
    SalesLine[] Lines,
    /// <summary>
    /// Whether the payload had a positions field at all, as opposed to one that
    /// was there and empty. A shop that sold nothing and a mapping that points
    /// at nothing produce the same empty list, and they deserve opposite
    /// answers: the first is a quiet day, the second is a misconfiguration the
    /// sender has to be told about.
    /// </summary>
    bool SawPositions);

/// <summary>
/// Hours worked on one day. Either the two clock times or a plain count of
/// hours; the receiving side turns whichever arrived into a placement.
/// </summary>
public sealed record HoursPayload(
    DateOnly Date,
    string? ExternalId,
    /// <summary>Names the template. Null falls back to the endpoint's default.</summary>
    string? Shift,
    TimeOnly? Start,
    TimeOnly? End,
    double? Hours,
    int? BreakMinutes,
    /// <summary>
    /// Whether this was worked or is still a plan. Defaults to worked: a
    /// timesheet reports what happened, and a rota exporter that means
    /// otherwise can map the field.
    /// </summary>
    bool Worked);
