namespace Shifter.Application.Features.Gigs;

#pragma warning disable IDE1006 // wire names

public record GigSaveDto(
    string? venue,
    string? category,
    string? employment,
    string[]? photos,
    string? schedule,
    string? title,
    string? details,
    string? date,
    string? start,
    string? end,
    decimal pay_amount,
    string? pay_period,
    string? city,
    int slots);

public record GigDto(
    int id,
    string venue,
    string category,
    string employment,
    string[] photos,
    string? schedule,
    string title,
    string? details,
    string date,
    string start,
    string end,
    decimal pay_amount,
    string pay_period,
    string city,
    int slots,
    string status,
    int responses,
    bool is_mine,
    /// <summary>What the caller's own reply looks like, when they made one.</summary>
    GigMyResponseDto? my_response);

public record GigMyResponseDto(int id, bool accepted);

public record GigRespondDto(string? message, string? phone, string? telegram);

/// <summary>An owner's view of one reply: the person and what they chose to share.</summary>
public record GigResponseDto(
    int id,
    int user_id,
    string name,
    string? avatar_kind,
    string? avatar_data,
    string? message,
    string? phone,
    string? telegram,
    bool accepted,
    string created_at);

public record GigWithResponsesDto(GigDto gig, GigResponseDto[] replies);
