namespace Shifter.Domain.Entities;

public enum SwapStatus
{
    Pending = 0,
    Accepted = 1,
    Declined = 2,
    /// <summary>Withdrawn by the person who proposed it.</summary>
    Cancelled = 3,
}

/// <summary>
/// "I take your Wednesday, you take my Friday." A cover hands a shift one
/// way; a swap trades two, and only when both people agree. Each half is
/// copied onto the row at proposal time, so the offer still reads correctly
/// after the placements themselves are gone.
/// </summary>
public sealed class ShiftSwap
{
    public int Id { get; set; }

    public int TeamId { get; set; }
    public Team? Team { get; set; }

    public int ProposerUserId { get; set; }
    public int TargetUserId { get; set; }

    /// <summary>The placements traded, nulled once the swap is done with them.</summary>
    public int? ProposerDayShiftId { get; set; }
    public int? TargetDayShiftId { get; set; }

    public required DateOnly ProposerDate { get; set; }
    public required string ProposerShiftName { get; set; }
    public TimeOnly ProposerStart { get; set; }
    public TimeOnly ProposerEnd { get; set; }

    public required DateOnly TargetDate { get; set; }
    public required string TargetShiftName { get; set; }
    public TimeOnly TargetStart { get; set; }
    public TimeOnly TargetEnd { get; set; }

    public string? Note { get; set; }

    public SwapStatus Status { get; set; } = SwapStatus.Pending;

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime? RespondedAt { get; set; }
}
