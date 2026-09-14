namespace Shifter.Domain.Entities;

/// <summary>What the board pays for a job in a city.</summary>
public static class MarketRate
{
    /// <summary>Separate employers behind a figure before it may be shown.</summary>
    public const int Employers = 5;

    /// <summary>Postings behind it, which is a different question from how many employers.</summary>
    public const int Listings = 8;

    /// <summary>No single employer may account for more than this share of the sample.</summary>
    public const decimal Loudest = 0.4m;

    public sealed record Sample(int EmployerId, decimal PerHour);

    public sealed record Band(
        decimal Median,
        /// <summary>The quartiles — the spread is the honest part of the answer.</summary>
        decimal Low,
        decimal High,
        int Employers,
        int Listings);

    /// <summary>Null wherever the sample cannot carry a public number.</summary>
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

    /// <summary>The nearest-rank quantile, which is a real observed rate rather than an interpolation between two of them.</summary>
    private static decimal Quantile(decimal[] sorted, decimal share)
    {
        var rank = (int)Math.Ceiling((double)share * sorted.Length) - 1;

        return sorted[Math.Clamp(rank, 0, sorted.Length - 1)];
    }

    /// <summary>Where somebody's own rate falls in that spread, as a short verdict.</summary>
    public static string Standing(Band band, decimal mine) =>
        mine < band.Low ? "below"
        : mine > band.High ? "above"
        : "usual";
}
