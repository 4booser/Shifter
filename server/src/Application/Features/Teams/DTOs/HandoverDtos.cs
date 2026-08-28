namespace Shifter.Application.Features.Teams.DTOs;

/// <summary>
/// The note the shift going home leaves for the shift coming in, and who wrote
/// it. A handover with no name on it is a rumour.
/// </summary>
public record HandoverDto(
    string date,
    string text,
    string? by,
    string? updated_at);

public record HandoverSaveDto(string? date, string? text);

/// <summary>
/// Something the room does not have, or something that is broken. Carries the
/// day it was raised, because a grinder broken for three weeks is a different
/// conversation from one broken this morning.
/// </summary>
public record StopItemDto(
    int id,
    /// <summary>stop or broken.</summary>
    string kind,
    string name,
    string raised_by,
    string raised_on,
    /// <summary>How long it has been like this. Zero on the day it was raised.</summary>
    int days,
    bool cleared);

public record StopItemSaveDto(string? kind, string? name);
