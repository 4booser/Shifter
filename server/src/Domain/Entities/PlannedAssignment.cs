using Shifter.Domain.Entities.Enums;

namespace Shifter.Domain.Entities;

/// <summary>One cell of the manager's board: this person, this day, these hours.</summary>
public sealed class PlannedAssignment
{
    public int Id { get; set; }

    public int TeamId { get; set; }
    public Team? Team { get; set; }

    /// <summary>Who is being asked to work it.</summary>
    public int UserId { get; set; }
    public User? User { get; set; }

    /// <summary>Nullable so a planner can leave without deleting the rota they built.</summary>
    public int? CreatedByUserId { get; set; }
    public User? CreatedBy { get; set; }

    public required DateOnly Date { get; set; }

    /// <summary>What the board calls it: "Bar", "Открытие", a code.</summary>
    public required string Title { get; set; }

    /// <summary>Which station this cell covers.</summary>
    public PlanRole Role { get; set; } = PlanRole.Unset;

    public TimeOnly StartTime { get; set; }
    public TimeOnly EndTime { get; set; }

    public string? Note { get; set; }

    public AssignmentStatus Status { get; set; } = AssignmentStatus.Draft;

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime? PublishedAt { get; set; }
    public DateTime? RespondedAt { get; set; }
}
