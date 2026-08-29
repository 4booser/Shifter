using Shifter.Application.Features.Import;

using Xunit;

namespace Shifter.Tests;

/// <summary>
/// A photographed receipt turned into the beginnings of an expense. Receipts
/// are creased and photographed in bad light, so nearly every rule here is
/// about what to do when the read went wrong.
/// </summary>
public class ReceiptParseTests
{
    private static readonly DateOnly Today = new(2026, 8, 29);

    private static ReceiptParse.Read Read(string text)
        => ReceiptParse.FromModelText(text, Today);

    [Fact]
    public void ItReadsAnOrdinaryReceipt()
    {
        var read = Read(
            """{"amount": "342.50", "date": "2026-08-28", "merchant": "СІЛЬПО", "currency": "UAH"}""");

        Assert.Equal(342.50m, read.Amount);
        Assert.Equal(new DateOnly(2026, 8, 28), read.Date);
        Assert.Equal("СІЛЬПО", read.Merchant);
        Assert.Equal("UAH", read.Currency);
    }

    [Fact]
    public void ItDigsTheObjectOutOfWhateverTheModelWrappedItIn()
    {
        // Models put JSON inside prose and fences however firmly the prompt
        // forbids it.
        var read = Read("Here is the receipt:\n```json\n{\"amount\": \"120\"}\n```\nHope that helps!");

        Assert.Equal(120m, read.Amount);
    }

    [Fact]
    public void AFieldTheModelCouldNotReadComesBackEmpty()
    {
        var read = Read("""{"amount": "500", "date": null, "merchant": null, "currency": null}""");

        Assert.Equal(500m, read.Amount);
        Assert.Null(read.Date);
        Assert.Null(read.Merchant);
    }

    [Fact]
    public void ARubbishAnswerLeavesEveryFieldForThePerson()
    {
        // A reader that fails by clearing the form is worse than no reader:
        // somebody came here to record a number and now starts again.
        var read = Read("I could not read this image.");

        Assert.Null(read.Amount);
        Assert.Null(read.Date);
        Assert.Null(read.Merchant);
    }

    [Fact]
    public void ATotalOfNothingIsNotATotal()
    {
        Assert.Null(Read("""{"amount": "0"}""").Amount);
        Assert.Null(Read("""{"amount": "-40"}""").Amount);
    }

    [Fact]
    public void AMillionHryvniaCoffeeIsADecimalPointInTheWrongPlace()
    {
        Assert.Null(Read("""{"amount": "34250000"}""").Amount);
    }

    [Fact]
    public void ItReadsThroughWhateverIsStuckToTheNumber()
    {
        Assert.Equal(342.50m, Read("""{"amount": "342,50 ₴"}""").Amount);
        Assert.Equal(1200m, Read("""{"amount": "1200 UAH"}""").Amount);
    }

    [Fact]
    public void AReceiptFromTheFutureIsAMisreadYear()
    {
        // Tomorrow is allowed: a till in another timezone, or a photograph
        // taken either side of midnight.
        Assert.Equal(new DateOnly(2026, 8, 30), Read("""{"date": "2026-08-30"}""").Date);
        Assert.Null(Read("""{"date": "2027-01-04"}""").Date);
        Assert.Null(Read("""{"date": "2015-03-02"}""").Date);
    }

    [Fact]
    public void ADateInAnyOtherShapeIsNoDate()
    {
        // Rather than a guess between the American and the European reading,
        // which differ by up to eleven months and look equally plausible.
        Assert.Null(Read("""{"date": "28.08.2026"}""").Date);
        Assert.Null(Read("""{"date": "yesterday"}""").Date);
    }

    [Fact]
    public void ACurrencyItCannotNameIsLeftToTheForm()
    {
        Assert.Null(Read("""{"currency": "₴"}""").Currency);
        Assert.Null(Read("""{"currency": "hryvnia"}""").Currency);
        Assert.Equal("PLN", Read("""{"currency": "pln"}""").Currency);
    }

    [Fact]
    public void AnAddressPastedAsAShopNameIsCutToASize()
    {
        var long_ = new string('м', 200);

        Assert.Equal(ReceiptParse.MerchantMax, Read($$"""{"merchant": "{{long_}}"}""").Merchant!.Length);
    }

    [Fact]
    public void ThePromptSaysWhichNumberTheTotalIs()
    {
        // The commonest wrong read on a receipt is the subtotal or the cash
        // tendered, and both sit right next to the total.
        Assert.Contains("after discounts", ReceiptParse.Prompt);
        Assert.Contains("not the cash tendered", ReceiptParse.Prompt);
        Assert.Contains("Never invent a date", ReceiptParse.Prompt);
    }
}
