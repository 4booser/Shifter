namespace Shifter.Domain.Entities;

/// <summary>Somebody's own tax arrangement, in their own numbers.</summary>
public sealed class TaxProfile
{
    public const int NameMax = 60;

    public int Id { get; set; }

    public int UserId { get; set; }
    public User? User { get; set; }

    /// <summary>What this arrangement is called, in the person's words: "ФОП 2 група", "Umowa zlecenie", "Self-employed".</summary>
    public required string Name { get; set; }

    /// <summary>The year it describes. Rates change; a profile is about one year.</summary>
    public int Year { get; set; }

    /// <summary>Percent of income, where the arrangement takes one.</summary>
    public decimal? Percent { get; set; }

    /// <summary>A flat amount each month, where there is one.</summary>
    public decimal? FixedMonthly { get; set; }

    /// <summary>Contributions paid monthly regardless of income — the part people forget when they work out what a quiet…</summary>
    public decimal? SocialMonthly { get; set; }

    /// <summary>The ceiling on a year's income for this arrangement, as the person entered it.</summary>
    public decimal? AnnualLimit { get; set; }

    /// <summary>Where the income figure comes from: "paid" counts money recorded as received, "earned" counts what the shifts…</summary>
    public string Basis { get; set; } = "paid";

    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
}
