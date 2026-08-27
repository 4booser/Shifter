namespace Shifter.Application.Features.business.DTOs;

/// <summary>
/// A document and how long it has left. The days are computed on the server so
/// the phone and the site cannot disagree about whether something has expired
/// — which, on a medical book, is the difference between working a shift and
/// being sent home from it.
/// </summary>
public record DocumentDto(
    int id,
    /// <summary>medical, sanitary, certificate, licence, permit or other.</summary>
    string kind,
    string name,
    DateOnly expires_on,
    string? note,
    /// <summary>Negative once it has run out.</summary>
    int days_left,
    /// <summary>expired, urgent, soon or fine.</summary>
    string state);

public record DocumentSaveDto(
    string? kind,
    string name,
    DateOnly expires_on,
    string? note);
