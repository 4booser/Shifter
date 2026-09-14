namespace Shifter.Domain.Entities;

/// <summary>A shortfall somebody has drawn a line under.</summary>
public sealed class PeriodSettlement
{
    public const int NoteMax = 200;

    public int Id { get; set; }

    public int UserId { get; set; }
    public User? User { get; set; }

    public int LocationId { get; set; }

    /// <summary>Which period, by the day it starts — the same key the rows use.</summary>
    public required DateOnly PeriodFrom { get; set; }

    /// <summary>"all", "wage" or "commission": which payment was closed.</summary>
    public required string Stream { get; set; }

    /// <summary>"paid" where the money arrived off the books, "written-off" where it never will.</summary>
    public required string Kind { get; set; }

    public string? Note { get; set; }

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}
