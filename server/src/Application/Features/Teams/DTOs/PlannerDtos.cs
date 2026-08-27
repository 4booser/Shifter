namespace Shifter.Application.Features.Teams.DTOs;

/// <summary>One cell of the board, as both sides read it.</summary>
public record AssignmentDto(
    int id,
    int user_id,
    string user_name,
    string date,
    string title,
    string start,
    string end,
    string? note,
    /// <summary>draft, published, accepted or declined.</summary>
    string status,
    /// <summary>
    /// The station this cell covers: "bar", "kitchen", "floor", "host",
    /// "support", "manager", or "" where nobody said.
    /// </summary>
    string role = ""
    );

public record AssignmentSaveDto(
    int user_id,
    string date,
    string title,
    string start,
    string end,
    string? note,
    /// <summary>
    /// Defaulted so a client written before roles existed keeps drafting
    /// rather than silently clearing the station on every edit.
    /// </summary>
    string? role = null
    );

/// <summary>
/// One day's coverage, station by station. The number a manager is actually
/// looking for on a board is not "how many people" but "how many bars", and
/// nothing else on the screen answers it.
/// </summary>
public record CoverageDayDto(string date, CoverageRoleDto[] roles, int unset);

public record CoverageRoleDto(string role, int count);

public record PlannerMemberDto(
    int user_id,
    string display_name,
    string colour,
    bool is_owner,
    bool is_manager
    );

/// <summary>The manager's read: everyone, and every assignment in range.</summary>
public record PlannerBoardDto(
    PlannerMemberDto[] members,
    AssignmentDto[] assignments,
    /// <summary>Whether the caller may write to the board.</summary>
    bool can_plan,
    /// <summary>Whether the caller may hand the board to others (owner).</summary>
    bool can_grant,
    /// <summary>Days the crew has blocked inside the window.</summary>
    AvailabilityDto[] blocked,
    /// <summary>
    /// Station counts per day across the window. Only days with something
    /// planned appear — an empty day is short of everything, and saying so
    /// seven times is noise rather than information.
    /// </summary>
    CoverageDayDto[] coverage
    );

public record PublishResultDto(int published, int people);

public record CopyWeekResultDto(int copied);

/// <summary>A day somebody has blocked, as the board and the crew see it.</summary>
public record AvailabilityDto(int user_id, string date, string? reason, bool mine);

public record AvailabilitySaveDto(string? date, string? reason);

public record AcceptAssignmentDto(int template_id);
