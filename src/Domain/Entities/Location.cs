using System.ComponentModel.DataAnnotations;

namespace Shifter.Domain.Entities;

/// <summary>
/// A place of work. People commonly hold two or three, each with its own rates
/// and its own payday, so totals have to be separable by location.
/// </summary>
public sealed class Location
{
    [Key]
    public int Id { get; set; }

    public int UserId { get; set; }

    // The navigation is what makes EF treat UserId as a real foreign key.
    public User? User { get; set; }

    public required string Name { get; set; }

    /// <summary>Optional: an address is rarely to hand when adding a job.</summary>
    public string? Address { get; set; }

    /// <summary>Hex colour used to tint this location's shifts in the calendar.</summary>
    public string Colour { get; set; } = "#1F3A5F";

    public PayPeriod PayPeriod { get; set; } = PayPeriod.Monthly;

    /// <summary>
    /// Where a period starts. For monthly and semi-monthly it is the day of the
    /// month; for the rolling periods it is any date the cycle passed through.
    /// </summary>
    public int PayDay { get; set; } = 1;
    public DateOnly PayAnchor { get; set; } = new DateOnly(2020, 1, 6);

    /// <summary>
    /// Hours past this many in one week are paid at the multiplier. Per
    /// location because the rule belongs to the employer, not the worker.
    /// </summary>
    public double OvertimeWeeklyHours { get; set; } = 40;
    public decimal OvertimeMultiplier { get; set; } = 1.5m;

    public bool Archived { get; private set; }

    public void ToArchive() => Archived = true;

    public void Restore() => Archived = false;
}
