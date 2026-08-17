using MediatR;

namespace Shifter.Application.Features.Teams.DTOs;

/// <summary>A team as it appears in the list of the ones you belong to.</summary>
public record TeamDto(
    int id,
    string name,
    bool is_owner,
    int member_count,
    /// <summary>Only the owner is shown the code; members do not need it.</summary>
    string? invite_code);

/// <summary>
/// One person's day on the shared rota.
///
/// This record is the privacy boundary, and it is a boundary by construction:
/// there is nowhere in it to put money. No pay, no tips, no sales, no rate —
/// not filtered out later, simply absent from the shape. Anything added here
/// becomes visible to every member of the team, so think before widening it.
/// </summary>
public record RotaEntryDto(
    int member_id,
    DateOnly date,
    string shift_name,
    string? symbol,
    string? colour,
    string start_time,
    string end_time,
    double hours,
    /// <summary>False means rostered but not yet done.</summary>
    bool worked,
    /// <summary>The person is looking for someone to take this one.</summary>
    bool needs_cover);

public record RotaMemberDto(
    int member_id,
    string display_name,
    bool is_you,
    /// <summary>Hours this person is on for across the range.</summary>
    double hours,
    int days,
    /// <summary>Shifts this person is asking to have covered.</summary>
    int cover_requests);

/// <summary>One day of the rota, seen across the whole team.</summary>
public record RotaDayDto(
    DateOnly date,
    /// <summary>Members on that day.</summary>
    int on_shift,
    /// <summary>Members with nothing on — who could pick something up.</summary>
    string[] free,
    double hours,
    int cover_requests);

/// <summary>The rota for a range: who is on, when, and for how long.</summary>
public record RotaDto(
    int team_id,
    string team_name,
    RotaMemberDto[] members,
    RotaEntryDto[] entries,
    /// <summary>Day by day: coverage, spare hands and open cover requests.</summary>
    RotaDayDto[] days);

public record CreateTeamDto(int UserId, string name) : IRequest<TeamDto>;

public record JoinTeamDto(int UserId, string invite_code, string? display_name)
    : IRequest<TeamDto>;

public record ListTeamsDto(int UserId) : IRequest<TeamDto[]>;

public record LeaveTeamDto(int UserId, int TeamId) : IRequest<Unit>;

public record RotateCodeDto(int UserId, int TeamId) : IRequest<TeamDto>;

public record GetRotaDto(int UserId, int TeamId, DateOnly From, DateOnly To)
    : IRequest<RotaDto>;

/// <summary>Body shapes; the user id never travels in one.</summary>
public record CreateTeamBody(string name);

public record JoinTeamBody(string invite_code, string? display_name);
