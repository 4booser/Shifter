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

    /// <summary>
    /// The currency the money actually arrived in — the place's, at the time.
    /// Empty means the app's own, which is what almost every payment is.
    /// </summary>
    public string Currency { get; set; } = string.Empty;

    /// <summary>
    /// Hryvnia per one unit of that currency, as published for the day the
    /// money arrived, stored here at the moment the payment was recorded.
    ///
    /// The point of storing it is that the past stops moving. A payment of
    /// 18 500 złoty in August is a fact; what that was worth is also a fact,
    /// and re-deriving it every time somebody opens the page means last
    /// August's wage changes every morning with the exchange rate. Null where
    /// the money arrived in the app's own currency, or where no rate was
    /// published — a missing rate is reported as missing, never as one.
    /// </summary>
    public decimal? RateToBase { get; set; }

    /// <summary>
    /// The day the stored rate was published for, which is not always the day
    /// the money arrived: nothing is published at a weekend, and the honest
    /// answer is the last rate that existed rather than an invented one.
    /// </summary>
    public DateOnly? RateOn { get; set; }

    /// <summary>
    /// Which of a place's payments this settles: "all" where everything arrives
    /// together, or "wage" and "commission" where the percentage runs on its
    /// own cycle. Without it a wage payment would be counted against the
    /// commission owed for the same days as well, and both rows would look
    /// settled on one transfer. Defaulted rather than nullable so every payment
    /// recorded before the split still matches its period.
    /// </summary>
    public string Stream { get; set; } = "all";

    /// <summary>
    /// What kind of payment this is: "settlement" for the money that closes a
    /// period, "advance" for the half that arrives mid-month, "bonus" for
    /// anything paid on top, "cash" for money handed over outside payroll.
    ///
    /// Half of hospitality pays twice — аванс and расчёт — and without this the
    /// advance reads as the whole payment for the period, so the reconciliation
    /// calls the place short on the day the period closes and keeps doing it
    /// every month. An advance is not a shortfall, it is a plan; the difference
    /// is a label, not a number.
    /// </summary>
    public string Kind { get; set; } = "settlement";
}
