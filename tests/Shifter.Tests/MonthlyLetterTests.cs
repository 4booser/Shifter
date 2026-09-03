using Shifter.Application.Features.Mail;

using Xunit;

namespace Shifter.Tests;

/// <summary>
/// The month in a letter. Once a month is the only frequency at which a letter
/// from an app is not an irritation, which puts the whole weight on it saying
/// something true and nothing padded.
/// </summary>
public class MonthlyLetterTests
{
    private static MonthlyLetter.Facts Facts(
        decimal earned = 30_000m,
        decimal tips = 0m,
        decimal? lastYear = null,
        decimal? previous = null,
        (string, decimal)? best = null,
        int unclosed = 0) => new(
            "Август 2026", earned, tips, 152.0, 19, lastYear, previous, best, unclosed);

    private static string Money(decimal value) => value.ToString("#,##0", System.Globalization.CultureInfo.InvariantCulture).Replace(",", " ") + " ₴";

    private static string Html(MonthlyLetter.Facts facts)
        => MonthlyLetter.Html(facts, Money, key => key, "https://shifter.ink/u/abc");

    [Fact]
    public void TheSubjectIsTheFigure()
    {
        // Burying it makes the letter look like marketing, which is what it
        // will be treated as.
        Assert.Equal("Август 2026: 30 000 ₴", MonthlyLetter.Subject(Facts(), Money(30_000m)));
    }

    [Fact]
    public void ItLeadsWithTheMonthAndTheMoney()
    {
        var html = Html(Facts());

        Assert.Contains("Август 2026", html);
        Assert.Contains("30 000 ₴", html);
    }

    [Fact]
    public void ItSaysNothingAboutAMonthThereIsNothingToCompareWith()
    {
        // "+0% against nothing" is the sort of line that teaches people the
        // letter is padding, and then they stop opening it.
        var html = Html(Facts());

        Assert.DoesNotContain("Month before", html);
        Assert.DoesNotContain("Same month last year", html);
    }

    [Fact]
    public void ItComparesWhereThereIsSomethingToCompare()
    {
        var html = Html(Facts(earned: 30_000m, previous: 25_000m, lastYear: 40_000m));

        Assert.Contains("+20%", html);
        Assert.Contains("−25%", html);
    }

    [Fact]
    public void ItMentionsTipsOnlyWhereThereWereSome()
    {
        Assert.DoesNotContain("Of that, tips", Html(Facts()));
        Assert.Contains("Of that, tips", Html(Facts(tips: 4_000m)));
    }

    [Fact]
    public void TheOnlyNagIsTheDaysNobodyFilledIn()
    {
        Assert.DoesNotContain("not filled in", Html(Facts()));
        Assert.Contains("Days worked but not filled in: 3", Html(Facts(unclosed: 3)));
    }

    [Fact]
    public void EveryLetterCarriesTheWayOut()
    {
        // One link, no login, no preference centre — the difference between a
        // letter people tolerate and one they mark as spam.
        Assert.Contains("https://shifter.ink/u/abc", Html(Facts()));
    }

    [Fact]
    public void AVenueCalledBarAndGrillDoesNotBecomeMarkup()
    {
        // Names and notes are typed by people, and a mail client will happily
        // render whatever reaches it as a tag.
        var html = Html(Facts(best: ("<b>Bar & Grill</b>", 3_000m)));

        Assert.DoesNotContain("<b>Bar", html);
        Assert.Contains("&lt;b&gt;Bar &amp; Grill", html);
    }

    [Fact]
    public void ItCarriesNoImagesAndNoStylesheet()
    {
        // Mail clients strip stylesheets and block remote images by default,
        // and there are a dozen of them. A letter that breaks in Outlook is
        // worse than a plain one everywhere.
        var html = Html(Facts(tips: 100m, previous: 1m, unclosed: 1, best: ("1", 1m)));

        Assert.DoesNotContain("<img", html);
        Assert.DoesNotContain("<style", html);
        Assert.DoesNotContain("<link", html);
    }

    /// <summary>
    /// The letter goes to an inbox, where a reader has nothing to compare a
    /// figure against and nobody to ask. It used to write «199.5 h» — an
    /// invariant decimal point and an English unit — under Russian prose.
    /// </summary>
    [Fact]
    public void TheLetterWritesHoursInTheLanguageItIsWrittenIn()
    {
        // A month's total is written whole — nobody reads «199,0 ч» — and a
        // short one keeps its tenth. Both in the reader's own notation.
        var month = new MonthlyLetter.Facts(
            "сентябрь 2026", 359_396m, 69_120m, 199.5, 22, null, null, null, 0);

        var html = MonthlyLetter.Html(month, value => $"{value:0} ₴", key => key == "h" ? "ч" : key, "https://x/stop");

        Assert.Contains("200 ч", html);
        Assert.DoesNotContain(" h<", html);

        var short_ = month with { Hours = 9.5 };
        var thin = MonthlyLetter.Html(short_, value => $"{value:0} ₴", key => key == "h" ? "ч" : key, "https://x/stop");

        Assert.Contains("9,5 ч", thin);
        Assert.DoesNotContain("9.5", thin);
    }
}
