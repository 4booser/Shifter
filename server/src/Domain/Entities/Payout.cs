namespace Shifter.Domain.Entities;

/// <summary>Money actually received, so the calculation can be checked against reality.</summary>
public sealed class Payout
{
    public int Id { get; set; }

    public int UserId { get; set; }
    public User? User { get; set; }

    /// <summary>Who paid it.</summary>
    public int? LocationId { get; set; }
    public Location? Location { get; set; }

    /// <summary>The stretch of work this payment covers, inclusive.</summary>
    public DateOnly PeriodFrom { get; set; }
    public DateOnly PeriodTo { get; set; }

    public decimal Amount { get; set; }
    public DateOnly ReceivedOn { get; set; }
    public string? Note { get; set; }

    /// <summary>The currency the money actually arrived in — the place's, at the time.</summary>
    public string Currency { get; set; } = string.Empty;

    /// <summary>Hryvnia per one unit of that currency, as published for the day the money arrived, stored here at the moment…</summary>
    public decimal? RateToBase { get; set; }

    /// <summary>The day the stored rate was published for, which is not always the day the money arrived: nothing is…</summary>
    public DateOnly? RateOn { get; set; }

    /// <summary>Which of a place's payments this settles: "all" where everything arrives together, or "wage" and "commission"…</summary>
    public string Stream { get; set; } = "all";

    /// <summary>What kind of payment this is: "settlement" for the money that closes a period, "advance" for the half that…</summary>
    public string Kind { get; set; } = "settlement";
}
