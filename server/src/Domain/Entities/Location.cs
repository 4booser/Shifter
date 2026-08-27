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

    /// <summary>
    /// Where the place physically is, set by "I am here" on a phone stood in
    /// it. Powers the "start a shift here?" nudge; both or neither.
    /// </summary>
    public double? Latitude { get; set; }

    public double? Longitude { get; set; }

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
    /// A second schedule for the sales commission, for the common arrangement
    /// where the wage arrives twice a month but the percentage settles once.
    /// Null means there is no second schedule and the commission is paid on the
    /// same cycle as everything else, which is what every existing place does.
    /// </summary>
    public PayPeriod? SalesPayPeriod { get; set; }

    /// <summary>Reads the same way as <see cref="PayDay"/>, for that schedule.</summary>
    public int SalesPayDay { get; set; } = 1;
    public DateOnly SalesPayAnchor { get; set; } = new DateOnly(2020, 1, 6);

    /// <summary>
    /// Hours past this many in one week are paid at the multiplier. Per
    /// location because the rule belongs to the employer, not the worker.
    /// </summary>
    public double OvertimeWeeklyHours { get; set; } = 40;
    public decimal OvertimeMultiplier { get; set; } = 1.5m;

    /// <summary>
    /// Night hours pay this much more. 1.0 means the place does not pay a
    /// night premium — the default, because inventing one would put money on
    /// the screen nobody agreed to.
    /// </summary>
    public decimal NightMultiplier { get; set; } = 1m;

    /// <summary>The window the premium covers; wraps midnight by design.</summary>
    public TimeOnly NightFrom { get; set; } = new TimeOnly(22, 0);
    public TimeOnly NightTo { get; set; } = new TimeOnly(6, 0);

    /// <summary>Public-holiday shifts pay this much more; 1.0 is off.</summary>
    public decimal PublicHolidayMultiplier { get; set; } = 1m;

    /// <summary>
    /// Whose holiday calendar decides. Empty means the place keeps no holiday
    /// premium at all, whatever the multiplier says.
    /// </summary>
    public string HolidayCountry { get; set; } = "";

    /// <summary>
    /// Share of tips handed to support staff. Standard in restaurants, and it
    /// comes straight off take-home, so the totals have to know about it.
    /// </summary>
    public decimal TipOutOfTipsPercent { get; set; }

    /// <summary>Share of sales tipped out, the other common house rule.</summary>
    public decimal TipOutOfSalesPercent { get; set; }

    /// <summary>
    /// Withheld for a staff meal, once per day worked here. Common in kitchens
    /// and dining rooms, and it comes off take-home like any other deduction.
    /// </summary>
    public decimal MealDeduction { get; set; }

    /// <summary>
    /// One way, in minutes. Zero means nobody has said, which is different from
    /// living upstairs — an unstated commute is left out of the arithmetic
    /// entirely rather than counted as free.
    ///
    /// This exists because "в час" is the most honest number in the app and
    /// still incomplete: an hour at the bar round the corner and an hour at the
    /// bar forty minutes away are not the same hour, and everybody knows it
    /// without ever having counted it.
    /// </summary>
    public int CommuteMinutes { get; set; }

    /// <summary>
    /// What one trip costs, one way. Metro fare, petrol, the taxi home at four
    /// in the morning that only this place makes necessary.
    /// </summary>
    public decimal CommuteCost { get; set; }

    /// <summary>
    /// A shift longer than this earns an unpaid break automatically, in hours.
    /// Zero is off. The rule exists because the break is a house rule nobody
    /// re-types per shift — and because a template that forgets it prices an
    /// hour the person spent eating.
    /// </summary>
    public decimal AutoBreakAfterHours { get; set; }

    /// <summary>How long that automatic break is, in minutes.</summary>
    public int AutoBreakMinutes { get; set; }

    /// <summary>
    /// The hourly rate below which this place is not worth the trip, set by
    /// the person rather than read off a statute: legal minimums differ by
    /// country and year, and a wrong number here would be a confident lie
    /// about somebody's rights. Zero is off.
    /// </summary>
    public decimal MinimumHourly { get; set; }

    /// <summary>
    /// Income tax withheld at source, as a percent. Reported apart from the
    /// gross rather than folded into it: people need both figures — the gross
    /// to check against the payslip, the net to plan a month.
    /// </summary>
    public decimal TaxPercent { get; set; }

    /// <summary>
    /// Whether tips are taxed here too. Rules differ by country and by house,
    /// and guessing wrong misstates take-home by a lot in hospitality.
    /// </summary>
    public bool TaxTips { get; set; }

    /// <summary>
    /// Holiday pay accrued as a percent of gross. Money owed later, never
    /// added to what was earned now — that would be counting it twice.
    /// </summary>
    public decimal HolidayPercent { get; set; }

    /// <summary>
    /// ISO code of what this place pays in. Seasonal work abroad is common,
    /// and two currencies must never be added together.
    /// </summary>
    public string Currency { get; set; } = string.Empty;

    public bool Archived { get; private set; }

    public void ToArchive() => Archived = true;

    public void Restore() => Archived = false;
}
