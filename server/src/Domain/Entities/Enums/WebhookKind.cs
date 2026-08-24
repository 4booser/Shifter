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
    Hours = 1,

    /// <summary>
    /// Both, out of one delivery. A nightly report names what was sold and how
    /// long the shift ran, and splitting that across two addresses means two
    /// keys, two schedules and two things to keep in step for one report.
    ///
    /// Each half is written only if the payload actually carries it, so a
    /// delivery of takings alone never invents a shift.
    /// </summary>
    Both = 2
}
