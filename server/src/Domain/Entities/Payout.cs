namespace Shifter.Domain.Entities;

/// <summary>
/// Money actually received, so the calculation can be checked against reality.
/// Recording what a job says it paid is the whole reason people keep a shift
/// log in the first place.
/// </summary>
public sealed class Payout
{
    public int Id { get; set; }

    public int UserId { get; set; }
    public User? User { get; set; }

    /// <summary>
    /// Who paid it. Nullable because a payment can arrive without being
    /// attributable — a lump sum, or an account that never set places up — and
    /// refusing to record it would be worse than recording it loosely. Those
    /// count towards the total but not towards any one place's reconciliation.
    /// </summary>
    public int? LocationId { get; set; }
    public Location? Location { get; set; }

    /// <summary>The stretch of work this payment covers, inclusive.</summary>
    public DateOnly PeriodFrom { get; set; }
    public DateOnly PeriodTo { get; set; }

    public decimal Amount { get; set; }
    public DateOnly ReceivedOn { get; set; }
    public string? Note { get; set; }
}
