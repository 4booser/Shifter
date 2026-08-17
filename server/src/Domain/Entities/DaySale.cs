using System.ComponentModel.DataAnnotations.Schema;

namespace Shifter.Domain.Entities;

/// <summary>
/// How much of one catalogue position was sold on one day. Quantity lives here
/// rather than on Sales, which is the price list and stays the same every day.
/// </summary>
public sealed class DaySale
{
    public int Id { get; set; }

    public int DayId { get; set; }
    public Day? Day { get; set; }

    public int SalesId { get; set; }
    public Sales? Sales { get; set; }

    public int Quantity { get; set; }

    // Snapshots taken when the entry is recorded. Raising the catalogue price
    // must not rewrite what was earned on days already worked.
    public decimal UnitPrice { get; set; }
    public decimal Percentage { get; set; }

    /// <summary>
    /// Worker's cut for this position on this day. NotMapped: it is derived
    /// from columns that are stored, and EF cannot materialise a get-only
    /// property with no backing field.
    /// </summary>
    [NotMapped]
    public decimal Earned => Quantity * UnitPrice * Percentage / 100m;
}
