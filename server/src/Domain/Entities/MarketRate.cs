namespace Shifter.Domain.Entities;

/// <summary>
/// What the board pays for a job in a city.
///
/// This is the number people install an app for and stay for: "барменам в
/// Киеве платят 220 в час" is the one fact nobody can look up and everybody
/// wants. It is also the one number that is dangerous to get wrong, in two
/// different ways at once — wrong high and somebody turns down a fair offer;
/// built from too few people and it stops being a statistic and becomes a
/// report on one venue's payroll.
///
/// So the whole class is thresholds. Not enough independent employers, or one
/// of them shouting over the others, and there is no figure at all. Silence is
/// a perfectly good answer; a confident number from four listings is not.
///
/// Never a mean. One catering agency posting 900 an hour would drag an average
/// across the whole city, and the person reading it works in a bar.
/// </summary>
public static class MarketRate
{
    /// <summary>
    /// Separate employers behind a figure before it may be shown.
    ///
    /// Five is the point where a reader cannot work backwards to a particular
    /// venue's rates, which is the actual risk here — not that the number is
    /// noisy but that it identifies somebody.
    /// </summary>
    public const int Employers = 5;

    /// <summary>Postings behind it, which is a different question from how many employers.</summary>
    public const int Listings = 8;

    /// <summary>
    /// No single employer may account for more than this share of the sample.
    ///
    /// A chain posting forty of sixty listings makes the "city median" that
    /// chain's own rate, published under a heading that says otherwise. The
    /// guard matters more than the counts: the counts can be met while the
    /// figure is still about one company.
    /// </summary>
    public const decimal Loudest = 0.4m;

    public sealed record Sample(int EmployerId, decimal PerHour);

    public sealed record Band(
        decimal Median,
        /// <summary>The quartiles — the spread is the honest part of the answer.</summary>
        decimal Low,
        decimal High,
        int Employers,
        int Listings);

    /// <summary>
    /// Null wherever the sample cannot carry a public number. The caller is
    /// meant to say "not enough postings yet" and mean it.
    /// </summary>
    public static Band? Read(IEnumerable<Sample> samples)
    {
        var rates = samples.Where(sample => sample.PerHour > 0m).ToArray();

        if (rates.Length < Listings) return null;

        var employers = rates.Select(sample => sample.EmployerId).Distinct().Count();

        if (employers < Employers) return null;

        var loudest = rates
            .GroupBy(sample => sample.EmployerId)
            .Max(group => group.Count());

        if ((decimal)loudest / rates.Length > Loudest) return null;

        var sorted = rates.Select(sample => sample.PerHour).OrderBy(rate => rate).ToArray();

        return new Band(
            Quantile(sorted, 0.5m),
            Quantile(sorted, 0.25m),
            Quantile(sorted, 0.75m),
            employers,
            rates.Length);
    }

    /// <summary>
    /// The nearest-rank quantile, which is a real observed rate rather than an
    /// interpolation between two of them. Somebody is actually being offered
    /// this figure, which is what makes it quotable in a conversation with a
    /// manager.
    /// </summary>
    private static decimal Quantile(decimal[] sorted, decimal share)
    {
        var rank = (int)Math.Ceiling((double)share * sorted.Length) - 1;

        return sorted[Math.Clamp(rank, 0, sorted.Length - 1)];
    }

    /// <summary>
    /// Where somebody's own rate falls in that spread, as a short verdict.
    ///
    /// Deliberately three coarse words rather than a percentile. "Вы в 31-м
    /// перцентиле" is a number about a person that invites them to compare
    /// themselves; "ниже обычного для города" is a fact about the city that
    /// invites them to ask for a rise, which is the point of the whole feature.
    /// </summary>
    public static string Standing(Band band, decimal mine) =>
        mine < band.Low ? "below"
        : mine > band.High ? "above"
        : "usual";
}
