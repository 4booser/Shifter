namespace Shifter.Domain.Entities;

/// <summary>
/// A catalogue position: what can be sold, at what price, and what share of it
/// the worker keeps. Quantities are not here — they belong to DaySale.
/// </summary>
public class Sales
{
    public int Id { get; set; }

    public int UserId { get; set; }

    // The navigation is what makes EF treat UserId as a real foreign key.
    public User? User { get; set; }

    public required string Name { get; set; }
    public required decimal Price { get; set; }

    /// <summary>Percent of the price per unit, e.g. 7.5 for 7.5%.</summary>
    public decimal? Percentage { get; set; }

    // Retiring a position must not erase what it earned: days keep their own
    // copy of the price and percentage, so archiving only hides it from entry.
    public bool Archived { get; private set; }

    public void ToArchive() => Archived = true;

    public void Restore() => Archived = false;
}
