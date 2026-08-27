using Shifter.Application.Features.Assistant;
using Shifter.Application.Features.business.DTOs;

using Xunit;

namespace Shifter.Tests;

/// <summary>
/// The assistant's two halves that must not need a model: which blanks are
/// worth asking about, and what a plain question gets answered with. Both are
/// pure functions of figures we already computed, which is the point — the
/// model dresses these answers, it never replaces them.
/// </summary>
public class AssistantTests
{
    private static readonly DateOnly Today = new(2026, 3, 20);

    /// <summary>
    /// Money is grouped with a non-breaking space on purpose — "18 140" must
    /// not wrap in the middle — so the assertions compare against text with
    /// every kind of space flattened rather than pinning the codepoint.
    /// </summary>
    private static string Flat(string text) =>
        new(text.Select(character => char.IsWhiteSpace(character) ? ' ' : character).ToArray());

    private static DayShiftDto Shift(
        bool worked = true,
        decimal? revenue = null,
        decimal? percent = null,
        string name = "Бар") =>
        new(1, name, null, null, "18:00", "02:00", 8, 1_600m, revenue, percent, worked, false, null, null, 0);

    private static DayDto Day(
        string date,
        DayShiftDto[]? shifts = null,
        decimal? tips = null,
        decimal? pool = null) =>
        new(
            DateOnly.Parse(date),
            shifts ?? [Shift()],
            [],
            tips,
            null,
            pool,
            0m,
            0m,
            null,
            null,
            8,
            1_600m,
            0m);

    // ==== Which blanks are worth a question ====

    [Fact]
    public void AWorkedDayWithNoTipsIsWorthAsking()
    {
        var gaps = AssistantGaps.Find([Day("2026-03-18")], Today);

        Assert.Contains(gaps, gap => gap.kind == "tips" && gap.date == "2026-03-18");
    }

    [Fact]
    public void ATypedZeroIsAnAnswerAndIsNotAskedAgain()
    {
        var gaps = AssistantGaps.Find([Day("2026-03-18", tips: 0m)], Today);

        Assert.DoesNotContain(gaps, gap => gap.kind == "tips");
    }

    [Fact]
    public void APooledDayIsNotAskedForPersonalTips()
    {
        var gaps = AssistantGaps.Find([Day("2026-03-18", pool: 9_000m)], Today);

        Assert.DoesNotContain(gaps, gap => gap.kind == "tips");
    }

    [Fact]
    public void APercentageShiftWithNoTakingsIsWorthAsking()
    {
        var day = Day("2026-03-18", [Shift(percent: 3m)], tips: 0m);
        var gaps = AssistantGaps.Find([day], Today);

        var gap = Assert.Single(gaps, gap => gap.kind == "revenue");

        Assert.Equal(1, gap.shift_id);
        Assert.Contains("3%", gap.question);
    }

    [Fact]
    public void TakingsAlreadyRecordedAreNotAskedAbout()
    {
        var day = Day("2026-03-18", [Shift(percent: 3m, revenue: 42_000m)], tips: 0m);

        Assert.Empty(AssistantGaps.Find([day], Today));
    }

    [Fact]
    public void ADayOffHasNothingToAskAbout()
    {
        Assert.Empty(AssistantGaps.Find([Day("2026-03-18", [])], Today));
    }

    [Fact]
    public void TomorrowIsNotAskedAbout()
    {
        // A shift that has not happened cannot have takings yet.
        var ahead = Day("2026-03-25", [Shift(percent: 3m)]);

        Assert.Empty(AssistantGaps.Find([ahead], Today));
    }

    [Fact]
    public void TheNewestBlanksComeFirstAndTheListStaysShort()
    {
        var days = Enumerable.Range(1, 20)
            .Select(day => Day($"2026-03-{day:00}"))
            .ToArray();

        var gaps = AssistantGaps.Find(days, Today);

        Assert.Equal(AssistantGaps.Limit, gaps.Length);
        Assert.Equal("2026-03-20", gaps[0].date);
    }

    // ==== What a plain question gets answered with ====

    private static AssistantFacts Facts(
        decimal earned = 18_140m,
        double hours = 112,
        decimal tips = 300m,
        decimal revenue = 2_160m,
        decimal previous = 15_000m) =>
        new(
            "2026-03-01", "2026-03-31", "март 2026",
            earned, 0m, earned, 0m,
            14, hours, hours <= 0 ? 0m : Math.Round(earned / (decimal)hours, 2),
            16_240m, revenue, 18_000m, tips, 0m, 0m, 0m, 1_600m,
            0m, 0m, 0, 0,
            2_960m, "2026-03-05", "субботу", 11m, 17,
            [new AssistantPlace("Ночной бар", hours, earned)],
            previous,
            ["UAH"]);

    [Fact]
    public void HowMuchIsTheDefaultQuestion()
    {
        var answer = Flat(AssistantWriter.Answer("сколько я заработал?", Facts()));

        Assert.Contains("18 140", answer);
        Assert.Contains("14 смен", answer);
    }

    [Fact]
    public void TheBestDayIsNamedAndPlacedInTheMonth()
    {
        var answer = Flat(AssistantWriter.Answer("какой был лучший день", Facts()));

        Assert.Contains("5 марта", answer);
        Assert.Contains("2 960", answer);
    }

    [Fact]
    public void AnHourIsPricedFromTheHoursActuallyWorked()
    {
        var answer = Flat(AssistantWriter.Answer("сколько стоит мой час", Facts()));

        Assert.Contains("162", answer);
    }

    [Fact]
    public void AMissingFigureIsSaidPlainlyRatherThanInvented()
    {
        var answer = AssistantWriter.Answer("а чаевые?", Facts(tips: 0m));

        Assert.Contains("не отмечены", answer);
    }

    [Fact]
    public void ThePercentageIsAnsweredWithTheTakingsItCameFrom()
    {
        var answer = Flat(AssistantWriter.Answer("сколько принёс процент", Facts()));

        Assert.Contains("2 160", answer);
        Assert.Contains("18 000", answer);
    }

    [Fact]
    public void AnEmptyPeriodDoesNotDivideByZero()
    {
        var answer = AssistantWriter.Answer("сколько стоит мой час", Facts(earned: 0m, hours: 0));

        Assert.Contains("часов нет", answer);
    }

    [Fact]
    public void TheComparisonIsAgainstAnEqualSpan()
    {
        var answer = Flat(AssistantWriter.Answer("сколько заработал", Facts(previous: 9_070m)));

        // Exactly double, so exactly a hundred percent more.
        Assert.Contains("100%", answer);
    }

    [Fact]
    public void AQuietMonthIsNotDressedUpAsAChange()
    {
        var answer = Flat(AssistantWriter.Answer("сколько заработал", Facts(previous: 18_000m)));

        Assert.Contains("почти столько же", answer);
    }

    // ==== The written-out period ====

    [Fact]
    public void TheReportNamesEverySourceItHas()
    {
        var (summary, paragraphs) = AssistantWriter.Report(Facts());
        var text = Flat(string.Join("\n", paragraphs));

        Assert.Contains("18 140", Flat(summary));
        Assert.Contains("процент", text);
        Assert.Contains("чаевые", text);
        Assert.Contains("надбавки", text);
    }

    [Fact]
    public void AnEmptyPeriodSaysSoInsteadOfListingNothing()
    {
        var (summary, paragraphs) = AssistantWriter.Report(
            Facts(earned: 0m, hours: 0, tips: 0m, revenue: 0m) with { Shifts = 0 });

        Assert.Contains("не было", summary);
        Assert.Single(paragraphs);
    }
}
