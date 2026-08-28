using Shifter.Domain.Entities;

using Xunit;

namespace Shifter.Tests;

/// <summary>
/// The number people install the app for, and the one that must refuse to
/// appear more often than it appears. Nearly every test here is about silence.
/// </summary>
public class MarketRateTests
{
    private static MarketRate.Sample[] Board(params (int Employer, decimal Rate)[] rows)
        => rows.Select(row => new MarketRate.Sample(row.Employer, row.Rate)).ToArray();

    /// <summary>Ten listings across five employers, rates 100..190.</summary>
    private static MarketRate.Sample[] Healthy()
        => Enumerable.Range(0, 10)
            .Select(index => new MarketRate.Sample(index % 5, 100m + index * 10m))
            .ToArray();

    [Fact]
    public void ItReportsTheMiddleAndTheSpread()
    {
        var band = MarketRate.Read(Healthy())!;

        Assert.Equal(140m, band.Median);
        Assert.Equal(120m, band.Low);
        Assert.Equal(170m, band.High);
        Assert.Equal(5, band.Employers);
        Assert.Equal(10, band.Listings);
    }

    [Fact]
    public void ItSaysNothingWithTooFewPostings()
    {
        var thin = Healthy().Take(7).ToArray();

        Assert.Null(MarketRate.Read(thin));
    }

    [Fact]
    public void ItSaysNothingWithTooFewEmployers()
    {
        // Twenty listings from four venues is a report on four venues. The
        // count of postings is the easy threshold to pass and the wrong one.
        var few = Enumerable.Range(0, 20)
            .Select(index => new MarketRate.Sample(index % 4, 150m))
            .ToArray();

        Assert.Null(MarketRate.Read(few));
    }

    [Fact]
    public void ItSaysNothingWhenOneEmployerDrownsOutTheRest()
    {
        // A chain posting most of the board makes the "city median" that
        // chain's own rate, published under a heading that says otherwise.
        // Both counting thresholds are met here, which is the point.
        var chain = Board(
            (1, 100m), (1, 100m), (1, 100m), (1, 100m), (1, 100m), (1, 100m),
            (2, 200m), (3, 200m), (4, 200m), (5, 200m), (6, 200m));

        Assert.Null(MarketRate.Read(chain));
    }

    [Fact]
    public void OneOutlandishOfferBarelyMovesTheMiddle()
    {
        // A catering agency at 900 would drag a mean across the whole city,
        // and the person reading works in a bar. The median steps one rank —
        // the mean would have gone to 213.
        var withOutlier = Healthy().Append(new MarketRate.Sample(9, 900m)).ToArray();

        Assert.Equal(150m, MarketRate.Read(withOutlier)!.Median);
        Assert.Equal(214m, Math.Round(withOutlier.Average(sample => sample.PerHour)));
    }

    [Fact]
    public void TheQuartilesAreRatesSomebodyIsActuallyOffered()
    {
        // Nearest-rank rather than interpolated, so the figure can be quoted
        // in a conversation with a manager without being a number nobody has
        // ever posted.
        var band = MarketRate.Read(Healthy())!;

        Assert.Contains(band.Median, Healthy().Select(sample => sample.PerHour));
        Assert.Contains(band.Low, Healthy().Select(sample => sample.PerHour));
    }

    [Fact]
    public void FreeWorkIsNotARate()
    {
        var withZeroes = Healthy().Concat(Board((7, 0m), (8, 0m))).ToArray();

        Assert.Equal(10, MarketRate.Read(withZeroes)!.Listings);
    }

    [Fact]
    public void ItSaysNothingAboutAnEmptyBoard()
    {
        Assert.Null(MarketRate.Read([]));
    }
}

public class MarketStandingTests
{
    private static readonly MarketRate.Band Band = new(150m, 120m, 170m, 6, 12);

    [Theory]
    [InlineData(100, "below")]
    [InlineData(119, "below")]
    [InlineData(120, "usual")]
    [InlineData(150, "usual")]
    [InlineData(170, "usual")]
    [InlineData(171, "above")]
    public void ItPlacesARateInWordsRatherThanPercentiles(int mine, string expected)
    {
        // "Вы в 31-м перцентиле" is a number about a person and invites them
        // to feel something. "Ниже обычного для города" is a fact about the
        // city and invites them to ask for a rise, which is the whole point.
        Assert.Equal(expected, MarketRate.Standing(Band, mine));
    }
}
