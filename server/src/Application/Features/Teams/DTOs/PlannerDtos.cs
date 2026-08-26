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
    string status
    );

public record AssignmentSaveDto(
    int user_id,
    string date,
    string title,
    string start,
    string end,
    string? note
    );

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
    bool can_grant
    );

public record PublishResultDto(int published, int people);

public record CopyWeekResultDto(int copied);

public record AcceptAssignmentDto(int template_id);
