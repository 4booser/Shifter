namespace Shifter.Domain.Entities;

/// <summary>
/// What an endpoint is allowed to write. Kept narrow on purpose: a token that
/// leaks can only ever touch the one thing it was made for, and a POS system
/// sending its nightly totals has no business creating places of work.
/// </summary>
public enum WebhookKind
{
    /// <summary>Sold positions, tips and deductions for one day.</summary>
    Sales = 0,

    /// <summary>Hours actually worked on one day.</summary>
    Hours = 1
}
