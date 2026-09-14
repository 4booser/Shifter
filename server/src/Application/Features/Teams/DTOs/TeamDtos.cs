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

/// <summary>Somebody offering to take a shift. Names and nothing else.</summary>
public record RotaOfferDto(
    int offer_id,
    int member_id,
    string display_name,
    bool is_you,
    bool accepted);

/// <summary>One person's shift on the shared rota.</summary>
public record RotaEntryDto(
    /// <summary>Identifies the placement so an offer can name which one.</summary>
    int day_shift_id,
    int member_id,
    DateOnly date,
    string shift_name,
    string? symbol,
    /// <summary>The shift's own colour, as it appears on its owner's calendar.</summary>
    string? colour,
    /// <summary>The person's colour, which is how the crew tells them apart.</summary>
    string member_colour,
    string start_time,
    string end_time,
    double hours,
    /// <summary>False means rostered but not yet done.</summary>
    bool worked,
    /// <summary>The person is looking for someone to take this one.</summary>
    bool needs_cover,
    /// <summary>True when it is the caller's own shift, who alone can hand it over.</summary>
    bool is_mine,
    /// <summary>What the shift is set to do on the rota: "shown", "hidden", or "default".</summary>
    string? visibility,
    /// <summary>Null unless this person shares earnings. See the type remarks.</summary>
    decimal? pay,
    /// <summary>Who has offered to work it.</summary>
    RotaOfferDto[] offers);

public record RotaMemberDto(
    int member_id,
    string display_name,
    bool is_you,
    string colour,
    /// <summary>Hours this person is on for across the range.</summary>
    double hours,
    int days,
    /// <summary>Shifts this person is asking to have covered.</summary>
    int cover_requests,
    /// <summary>Whether this person lets the crew see what they earn.</summary>
    bool shares_earnings,
    /// <summary>Still learning the room.</summary>
    bool trainee,
    /// <summary>Null unless they do.</summary>
    decimal? earned,
    /// <summary>Shifts of theirs the crew cannot see. Only ever set for you.</summary>
    int? hidden,
    /// <summary>What their unmarked shifts do.</summary>
    bool? private_by_default,
    /// <summary>When your trial ends. Only ever set for you: the flag is the
    /// crew's business, the date is yours.</summary>
    DateOnly? trial_ends_on = null);

/// <summary>One day of the rota, seen across the whole team.</summary>
public record RotaDayDto(
    DateOnly date,
    /// <summary>Members on that day.</summary>
    int on_shift,
    /// <summary>Members with nothing on — who could pick something up.</summary>
    string[] free,
    double hours,
    int cover_requests,
    /// <summary>The day's takings across everyone who shares them.</summary>
    decimal? earned);

/// <summary>A crew member going out on the gig board that day. No money, no venue — just the fact.</summary>
public record RotaGigDto(int member_id, string date, string employment, string start, string end);

/// <summary>The rota for a range: who is on, when, and for how long.</summary>
public record RotaDto(
    int team_id,
    string team_name,
    RotaMemberDto[] members,
    RotaEntryDto[] entries,
    /// <summary>Day by day: coverage, spare hands and open cover requests.</summary>
    RotaDayDto[] days,
    /// <summary>Accepted gig-board outings inside the range, one chip each.</summary>
    RotaGigDto[] gig_outings,
    /// <summary>True where the reader's account has no second factor and the crew's shared totals are consequently being…</summary>
    bool needs_second_factor = false);

/// <summary>Offering to take somebody else's shift.</summary>
public record OfferCoverDto(int UserId, int TeamId, int DayShiftId) : IRequest<RotaOfferDto>;

/// <summary>Taking the offer back, which only the person who made it may do.</summary>
public record WithdrawCoverDto(int UserId, int TeamId, int OfferId) : IRequest<Unit>;

/// <summary>Handing the shift over, which only its owner may do.</summary>
public record AcceptCoverDto(int UserId, int TeamId, int OfferId) : IRequest<AcceptedCoverDto>;

/// <summary>What was handed over, so the client can say so plainly.</summary>
public record AcceptedCoverDto(
    DateOnly date,
    string shift_name,
    string start_time,
    string end_time,
    string taken_by);

public record CreateTeamDto(int UserId, string name) : IRequest<TeamDto>;

public record JoinTeamDto(int UserId, string invite_code, string? display_name)
    : IRequest<TeamDto>;

public record ListTeamsDto(int UserId) : IRequest<TeamDto[]>;

public record LeaveTeamDto(int UserId, int TeamId) : IRequest<Unit>;

public record RotateCodeDto(int UserId, int TeamId) : IRequest<TeamDto>;

public record GetRotaDto(int UserId, int TeamId, DateOnly From, DateOnly To)
    : IRequest<RotaDto>;

/// <summary>How you appear to your crew and how much of yourself you show them.</summary>
public record UpdateMembershipDto(
    int UserId,
    int TeamId,
    string? display_name,
    string? colour,
    bool? share_earnings,
    bool? private_by_default,
    bool? trainee = null,
    DateOnly? trial_ends_on = null) : IRequest<MembershipDto>;

/// <summary>Your own membership, which is the only one you may read in full.</summary>
public record MembershipDto(
    int member_id,
    string display_name,
    string colour,
    bool share_earnings,
    bool private_by_default,
    /// <summary>Still learning the room. Set by the person, never by an owner.</summary>
    bool trainee = false,
    /// <summary>When the trial ends, where one was agreed.</summary>
    DateOnly? trial_ends_on = null);

/// <summary>Marking one shift shown or hidden on the rota.</summary>
public record SetShiftVisibilityDto(int UserId, int DayShiftId, bool? visible)
    : IRequest<Unit>;

/// <summary>Body shapes; the user id never travels in one.</summary>
public record CreateTeamBody(string name);

public record JoinTeamBody(string invite_code, string? display_name);

public record MembershipBody(
    string? display_name,
    string? colour,
    bool? share_earnings,
    bool? private_by_default,
    bool? trainee = null,
    /// <summary>Absent leaves it; a trial that is over is cleared by sending null with trainee false.</summary>
    DateOnly? trial_ends_on = null);

public record VisibilityBody(bool? visible);

/// <summary>One proposed trade, from the caller's point of view.</summary>
public record SwapDto(
    int id,
    bool mine,
    string proposer_name,
    string target_name,
    string proposer_date,
    string proposer_shift,
    string proposer_start,
    string proposer_end,
    string target_date,
    string target_shift,
    string target_start,
    string target_end,
    string? note,
    string status,
    string created_at);

public record SwapProposeDto(int my_day_shift_id, int their_day_shift_id, string? note);

