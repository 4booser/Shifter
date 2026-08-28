namespace Shifter.Domain.Entities;

/// <summary>
/// Somebody's own tax arrangement, in their own numbers.
///
/// Simplified-tax rates change by law and by year, and they differ by group,
/// by region and by what a person registered for. A wrong figure here is not
/// an inaccuracy — it is a confident statement about somebody else's
/// obligations to the state, made by an app that has never seen their
/// registration.
///
/// So not one legal number comes out of our head. Every field is typed by the
/// person, from their own paperwork or their own accountant, and the app does
/// arithmetic on what they typed. The temptation to ship "the current rates"
/// is refused deliberately: it would be right for most people, wrong for some,
/// and indistinguishable between the two.
///
/// What the app adds is the part a person cannot do in their head — the
/// running total against the ceiling they entered, and roughly when they will
/// reach it.
/// </summary>
public sealed class TaxProfile
{
    public const int NameMax = 60;

    public int Id { get; set; }

    public int UserId { get; set; }
    public User? User { get; set; }

    /// <summary>
    /// What this arrangement is called, in the person's words: "ФОП 2 група",
    /// "Umowa zlecenie", "Self-employed". A free string on purpose — a list of
    /// the ones we happened to think of would be wrong somewhere.
    /// </summary>
    public required string Name { get; set; }

    /// <summary>The year it describes. Rates change; a profile is about one year.</summary>
    public int Year { get; set; }

    /// <summary>
    /// Percent of income, where the arrangement takes one. Null means it does
    /// not — and null is not zero: an arrangement with no percentage is a flat
    /// one, while zero per cent would be a claim that income is untaxed.
    /// </summary>
    public decimal? Percent { get; set; }

    /// <summary>A flat amount each month, where there is one.</summary>
    public decimal? FixedMonthly { get; set; }

    /// <summary>
    /// Contributions paid monthly regardless of income — the part people
    /// forget when they work out what a quiet month costs them.
    /// </summary>
    public decimal? SocialMonthly { get; set; }

    /// <summary>
    /// The ceiling on a year's income for this arrangement, as the person
    /// entered it. Null means they did not say, and then nothing is said back.
    /// </summary>
    public decimal? AnnualLimit { get; set; }

    /// <summary>
    /// Where the income figure comes from: "paid" counts money recorded as
    /// received, "earned" counts what the shifts came to.
    ///
    /// These are different numbers and the difference matters here more than
    /// anywhere else in the app — a ceiling is on what arrived. Stated rather
    /// than guessed, and shown beside every figure it produces.
    /// </summary>
    public string Basis { get; set; } = "paid";

    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
}
