namespace Shifter.Domain.Entities;

/// <summary>
/// One line of a day's history: when it changed, what changed it, and what
/// it held afterwards. Append-only — the answer to "where did my tips go"
/// is a list of moments, not a mutable record.
/// </summary>
public sealed class DayAudit
{
    public int Id { get; set; }

    public int UserId { get; set; }
    public User? User { get; set; }

    public required DateOnly Date { get; set; }

    public DateTime At { get; set; } = DateTime.UtcNow;

    /// <summary>"app", "webhook", "assignment" — whoever held the pen.</summary>
    public required string Source { get; set; }

    // The snapshot after the write, small enough to keep forever.
    public int ShiftCount { get; set; }
    public int WorkedCount { get; set; }
    public double Hours { get; set; }
    public decimal Earned { get; set; }
    public decimal Tips { get; set; }
    public int SalesUnits { get; set; }
}
