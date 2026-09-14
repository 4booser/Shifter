using System.ComponentModel.DataAnnotations;

namespace Shifter.Domain.Entities;

/// <summary>A place of work.</summary>
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

    /// <summary>Where the place physically is, set by "I am here" on a phone stood in it.</summary>
    public double? Latitude { get; set; }

    public double? Longitude { get; set; }

    /// <summary>The city, in the person's own words — «Львів», «Wrocław».</summary>
    public string? City { get; set; }

    /// <summary>Why this place was left, in the person's own words — and only for the person.</summary>
    public string? PrivateNote { get; set; }

    /// <summary>Hex colour used to tint this location's shifts in the calendar.</summary>
    public string Colour { get; set; } = "#1F3A5F";

    public PayPeriod PayPeriod { get; set; } = PayPeriod.Monthly;

    /// <summary>Where a period starts.</summary>
    public int PayDay { get; set; } = 1;
    public DateOnly PayAnchor { get; set; } = new DateOnly(2020, 1, 6);

    /// <summary>A second schedule for the sales commission, for the common arrangement where the wage arrives twice a month…</summary>
    public PayPeriod? SalesPayPeriod { get; set; }

    /// <summary>Reads the same way as <see cref="PayDay"/>, for that schedule.</summary>
    public int SalesPayDay { get; set; } = 1;
    public DateOnly SalesPayAnchor { get; set; } = new DateOnly(2020, 1, 6);

    /// <summary>Hours past this many in one week are paid at the multiplier.</summary>
    public double OvertimeWeeklyHours { get; set; } = 40;
    public decimal OvertimeMultiplier { get; set; } = 1.5m;

    /// <summary>Night hours pay this much more.</summary>
    public decimal NightMultiplier { get; set; } = 1m;

    /// <summary>The window the premium covers; wraps midnight by design.</summary>
    public TimeOnly NightFrom { get; set; } = new TimeOnly(22, 0);
    public TimeOnly NightTo { get; set; } = new TimeOnly(6, 0);

    /// <summary>Public-holiday shifts pay this much more; 1.0 is off.</summary>
    public decimal PublicHolidayMultiplier { get; set; } = 1m;

    /// <summary>Whose holiday calendar decides.</summary>
    public string HolidayCountry { get; set; } = "";

    /// <summary>Share of tips handed to support staff.</summary>
    public decimal TipOutOfTipsPercent { get; set; }

    /// <summary>Share of sales tipped out, the other common house rule.</summary>
    public decimal TipOutOfSalesPercent { get; set; }

    /// <summary>Withheld for a staff meal, once per day worked here.</summary>
    public decimal MealDeduction { get; set; }

    /// <summary>One way, in minutes.</summary>
    public int CommuteMinutes { get; set; }

    /// <summary>What one trip costs, one way.</summary>
    public decimal CommuteCost { get; set; }

    /// <summary>A shift longer than this earns an unpaid break automatically, in hours.</summary>
    public decimal AutoBreakAfterHours { get; set; }

    /// <summary>How long that automatic break is, in minutes.</summary>
    public int AutoBreakMinutes { get; set; }

    /// <summary>The hourly rate below which this place is not worth the trip, set by the person rather than read off a…</summary>
    public decimal MinimumHourly { get; set; }

    /// <summary>Income tax withheld at source, as a percent.</summary>
    public decimal TaxPercent { get; set; }

    /// <summary>Whether tips are taxed here too.</summary>
    public bool TaxTips { get; set; }

    /// <summary>Holiday pay accrued as a percent of gross.</summary>
    public decimal HolidayPercent { get; set; }

    /// <summary>ISO code of what this place pays in.</summary>
    public string Currency { get; set; } = string.Empty;

    public bool Archived { get; private set; }

    public void ToArchive() => Archived = true;

    public void Restore() => Archived = false;
}
