namespace Shifter.Domain.Entities;

/// <summary>
/// The arithmetic on a tax profile: what has come in, what that costs by the
/// person's own figures, and when their own stated ceiling runs out.
///
/// Pure, and it never invents a rate. Given no percentage it reports no
/// percentage tax; given no ceiling it says nothing about a ceiling. The whole
/// value of the feature is in the second half — a running total against a limit
/// is the one thing nobody can keep in their head, and the one thing people
/// find out too late.
/// </summary>
public static class TaxYear
{
    public sealed record Reading(
        decimal Income,
        /// <summary>Tax by the rate they entered. Null where they entered none.</summary>
        decimal? OnIncome,
        /// <summary>Flat charges for the months elapsed. Null where there are none.</summary>
        decimal? Flat,
        decimal? Social,
        decimal Total,
        /// <summary>Share of their stated ceiling used, 0..1. Null without one.</summary>
        decimal? LimitUsed,
        /// <summary>
        /// Roughly when the ceiling is reached at the pace so far. Null where
        /// there is no ceiling, no pace, or the year ends first.
        /// </summary>
        DateOnly? LimitOn);

    /// <summary>
    /// Below this many days of the year, a pace is not a pace.
    ///
    /// Two weeks of January projected across twelve months is arithmetic, not
    /// a forecast, and it would announce a ceiling breach to somebody who had
    /// one good fortnight.
    /// </summary>
    public const int PaceDays = 45;

    public static Reading Read(TaxProfile profile, decimal income, DateOnly today)
    {
        // Months already begun, because a flat charge for March is owed in
        // March and not at the end of it.
        var months = profile.Year < today.Year ? 12
            : profile.Year > today.Year ? 0
            : today.Month;

        var onIncome = profile.Percent is decimal percent
            ? Math.Round(income * percent / 100m, 2)
            : (decimal?)null;

        var flat = profile.FixedMonthly is decimal fixedMonthly
            ? Math.Round(fixedMonthly * months, 2)
            : (decimal?)null;

        var social = profile.SocialMonthly is decimal socialMonthly
            ? Math.Round(socialMonthly * months, 2)
            : (decimal?)null;

        var used = profile.AnnualLimit is decimal limit && limit > 0m
            ? Math.Round(income / limit, 4)
            : (decimal?)null;

        return new Reading(
            income,
            onIncome,
            flat,
            social,
            (onIncome ?? 0m) + (flat ?? 0m) + (social ?? 0m),
            used,
            Crossing(profile, income, today));
    }

    /// <summary>
    /// When the ceiling is reached if the year carries on as it has.
    ///
    /// A straight line through the pace so far, which is the only projection
    /// this data supports and is said as such wherever it is shown. Null once
    /// the date would fall outside the year: "you will not reach it" is the
    /// answer, and a date in the following March would read as a threat.
    /// </summary>
    private static DateOnly? Crossing(TaxProfile profile, decimal income, DateOnly today)
    {
        if (profile.AnnualLimit is not decimal limit || limit <= 0m) return null;
        if (income <= 0m) return null;
        if (profile.Year != today.Year) return null;

        var start = new DateOnly(profile.Year, 1, 1);
        var elapsed = today.DayNumber - start.DayNumber + 1;

        if (elapsed < PaceDays) return null;

        var perDay = income / elapsed;

        if (perDay <= 0m) return null;

        var needed = (limit - income) / perDay;

        if (needed < 0m) return today;

        var at = today.AddDays((int)Math.Ceiling((double)needed));

        return at.Year == profile.Year ? at : null;
    }
}
