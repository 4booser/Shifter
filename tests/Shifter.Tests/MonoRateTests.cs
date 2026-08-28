using System.Text.Json;

using Shifter.Application.Features.Money;

using Xunit;

namespace Shifter.Tests;

/// <summary>
/// The rate a person is actually handed, beside the one the state publishes.
/// These are the shapes the bank's own list comes in.
/// </summary>
public class MonoRateTests
{
    private static JsonElement Row(string json) => JsonDocument.Parse(json).RootElement;

    [Fact]
    public void ItReadsAPairThatIsQuotedBothWays()
    {
        var quote = MonoRateClient.ReadQuote(Row(
            """{"currencyCodeA":840,"currencyCodeB":980,"date":1787950873,"rateBuy":44.4,"rateSell":44.8009}"""))!;

        Assert.Equal(44.4m, quote.Buy);
        Assert.Equal(44.8009m, quote.Sell);
        Assert.Equal(new DateOnly(2026, 8, 28), quote.On);
    }

    [Fact]
    public void AThinlyTradedCurrencyFallsBackToItsCrossRate()
    {
        // The zloty comes with one number and no buy or sell. One number is
        // still an answer; skipping it would hide the rate for a currency a
        // great many people in this trade are actually paid in.
        var quote = MonoRateClient.ReadQuote(Row(
            """{"currencyCodeA":985,"currencyCodeB":980,"date":1787960258,"rateCross":12.07}"""))!;

        Assert.Equal(12.07m, quote.Buy);
        Assert.Equal(12.07m, quote.Sell);
    }

    [Fact]
    public void ARowWithNoRateAtAllIsNothingRatherThanZero()
    {
        // A zero here reads as "the bank will give you nothing for these",
        // which is a lie with a decimal point in it.
        Assert.Null(MonoRateClient.ReadQuote(Row(
            """{"currencyCodeA":999,"currencyCodeB":980,"date":1787960258}""")));

        Assert.Null(MonoRateClient.ReadQuote(Row(
            """{"currencyCodeA":999,"currencyCodeB":980,"rateBuy":0,"rateSell":0}""")));
    }

    [Fact]
    public void ARowWithNoDateIsStillARate()
    {
        // Dated today rather than dropped: the number is the useful part, and
        // it is shown with a date beside it either way.
        var quote = MonoRateClient.ReadQuote(Row(
            """{"currencyCodeA":840,"currencyCodeB":980,"rateBuy":44.4,"rateSell":44.8}"""))!;

        Assert.Equal(DateOnly.FromDateTime(DateTime.UtcNow), quote.On);
    }
}
