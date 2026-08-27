namespace Shifter.Domain.Entities;

/// <summary>
/// A shortfall somebody has drawn a line under. The reconciliation keeps
/// finding it — the arithmetic has not changed — so without this the same
/// underpayment nags for the rest of the account's life. Closing it is an
/// act with a date and a reason, not a number quietly edited until the
/// complaint goes away.
/// </summary>
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

    /// <summary>
    /// "paid" where the money arrived off the books, "written-off" where it
    /// never will. Both stop the nagging; only one of them is good news, and
    /// a year later the difference is the whole story.
    /// </summary>
    public required string Kind { get; set; }

    public string? Note { get; set; }

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}
