using Shifter.Application.Features.Money;

using Xunit;

namespace Shifter.Tests;

/// <summary>
/// Converting somebody's wages is the one place in this app where being
/// approximately right is worse than refusing: a figure nobody can reproduce
/// against their own bank statement is a figure they will act on and then
/// discover was invented.
/// </summary>
public class RateTests
{
    private static readonly DateOnly On = new(2026, 8, 27);

    private static Dictionary<string, (decimal Rate, DateOnly On)> Rates(
        params (string Code, decimal Rate)[] entries)
        => entries.ToDictionary(entry => entry.Code, entry => (entry.Rate, On));

    [Fact]
    public void TheSameCurrencyIsLeftExactlyAlone()
    {
        // Not rounded, not multiplied by one — returned.
        Assert.Equal(1234.56m, RateService.Convert(1234.56m, "PLN", "PLN", Rates()));
    }

    [Fact]
    public void IntoHryvniaIsOneMultiplication()
    {
        var converted = RateService.Convert(1_000m, "PLN", "UAH", Rates(("PLN", 11.3285m)));

        Assert.Equal(11_328.50m, converted);
    }

    [Fact]
    public void OutOfHryvniaIsOneDivision()
    {
        var converted = RateService.Convert(11_328.50m, "UAH", "PLN", Rates(("PLN", 11.3285m)));

        Assert.Equal(1_000m, converted);
    }

    [Fact]
    public void ACrossRateGoesThroughTheHryvniaOnce()
    {
        // 100 EUR at 48 is 4 800 UAH; at 12 to the zloty that is 400 PLN.
        var converted = RateService.Convert(100m, "EUR", "PLN", Rates(("EUR", 48m), ("PLN", 12m)));

        Assert.Equal(400m, converted);
    }

    [Fact]
    public void AMissingRateRefusesRatherThanGuessing()
    {
        // The temptation is to treat an unknown rate as one-to-one, which
        // would report a month in zloty as if it were hryvnia.
        Assert.Null(RateService.Convert(1_000m, "PLN", "UAH", Rates(("EUR", 48m))));
    }

    [Fact]
    public void AZeroRateIsNotADivisor()
    {
        Assert.Null(RateService.Convert(1_000m, "UAH", "PLN", Rates(("PLN", 0m))));
    }

    [Theory]
    [InlineData("pln", "PLN")]
    [InlineData("  eur  ", "EUR")]
    [InlineData(null, "UAH")]
    [InlineData("", "UAH")]
    [InlineData("zloty", "UAH")]
    public void ACodeIsNormalisedAndAnythingOddFallsBackToHryvnia(string? given, string expected)
    {
        Assert.Equal(expected, NbuRateClient.Normalise(given));
    }

    [Fact]
    public void ARateIsPrintedWithoutTrailingNoise()
    {
        // The rate is shown so somebody can check it; padded zeros are noise
        // and a comma would be a different number in another locale.
        Assert.Equal("11.3285", NbuRateClient.Format(11.328500m));
        Assert.Equal("48", NbuRateClient.Format(48.0000m));
    }

    [Theory]
    [InlineData("XYZ")]
    [InlineData("ZZZ")]
    [InlineData("BTC")]
    public void AnUnknownCodeIsNotAcceptedAsACurrency(string given)
    {
        // The code arrives in a query parameter. One that will never resolve
        // costs a walk back through eight days of the bank's API on every
        // single request, driven entirely from outside.
        Assert.Equal("UAH", NbuRateClient.Normalise(given));
    }

    [Fact]
    public void TheCurrenciesOfferedAreTheOnesAccepted()
    {
        // The picker on the settings screen must not offer something the
        // server will silently turn back into hryvnia.
        foreach (var code in new[] { "UAH", "PLN", "EUR", "USD", "CZK", "GBP" })
            Assert.Equal(code, NbuRateClient.Normalise(code));
    }
}
