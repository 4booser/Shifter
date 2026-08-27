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
            false,
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
            2_960m, "2026-03-05", "субботу", "пятницу", 640m, 11m, 17,
            [new AssistantPlace("Ночной бар", hours, earned, "UAH")],
            previous,
            ["UAH"]);

    [Fact]
    public void HowMuchIsTheDefaultQuestion()
    {
        var answer = Flat(AssistantWriter.Answer("сколько я заработал?", Facts()));

        Assert.Contains("18 140", answer);
        // Russian declines after a number: fourteen shifts are "смен".
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

    // ==== Which period a question is about ====

    private static (DateOnly From, DateOnly To) Period(string question)
        // The fallback is the current month, which is what the client sends.
        => AssistantPeriod.Of(question, Today, new DateOnly(2026, 3, 1), new DateOnly(2026, 3, 31));

    [Fact]
    public void AQuestionWithNoPeriodKeepsTheOneTheClientSent()
    {
        Assert.Equal((new DateOnly(2026, 3, 1), new DateOnly(2026, 3, 31)), Period("сколько я заработал"));
    }

    [Fact]
    public void ANamedMonthWinsOverTheClientsRange()
    {
        var (from, to) = Period("а сколько вышло в январе?");

        Assert.Equal(new DateOnly(2026, 1, 1), from);
        Assert.Equal(new DateOnly(2026, 1, 31), to);
    }

    [Fact]
    public void AMonthStillAheadMeansLastYears()
    {
        // Asked in March, "в декабре" cannot be about a December yet to come.
        var (from, to) = Period("сколько было в декабре");

        Assert.Equal(new DateOnly(2025, 12, 1), from);
        Assert.Equal(new DateOnly(2025, 12, 31), to);
    }

    [Fact]
    public void LastMonthIsTheMonthBefore()
    {
        var (from, to) = Period("а в прошлом месяце?");

        Assert.Equal(new DateOnly(2026, 2, 1), from);
        Assert.Equal(new DateOnly(2026, 2, 28), to);
    }

    [Fact]
    public void ThisWeekRunsMondayToSunday()
    {
        // The 20th of March 2026 is a Friday.
        var (from, to) = Period("сколько на этой неделе");

        Assert.Equal(new DateOnly(2026, 3, 16), from);
        Assert.Equal(new DateOnly(2026, 3, 22), to);
    }

    [Fact]
    public void LastWeekIsTheSevenDaysBeforeThisOne()
    {
        var (from, to) = Period("а на прошлой неделе?");

        Assert.Equal(new DateOnly(2026, 3, 9), from);
        Assert.Equal(new DateOnly(2026, 3, 15), to);
    }

    [Fact]
    public void YesterdayIsOneDay()
    {
        Assert.Equal((new DateOnly(2026, 3, 19), new DateOnly(2026, 3, 19)), Period("сколько вышло вчера"));
    }

    [Fact]
    public void TheYearIsTheWholeYear()
    {
        var (from, to) = Period("сколько за год");

        Assert.Equal(new DateOnly(2026, 1, 1), from);
        Assert.Equal(new DateOnly(2026, 12, 31), to);
    }

    [Theory]
    [InlineData(1, "1 смена")]
    [InlineData(2, "2 смены")]
    [InlineData(5, "5 смен")]
    [InlineData(11, "11 смен")]
    [InlineData(21, "21 смена")]
    [InlineData(22, "22 смены")]
    public void TheShiftCountDeclines(int count, string expected)
    {
        var answer = Flat(AssistantWriter.Answer("сколько заработал", Facts() with { Shifts = count }));

        Assert.Contains(expected, answer);
    }

    [Fact]
    public void AnEmptyPeriodIsASentenceRatherThanARowOfZeros()
    {
        var answer = AssistantWriter.Answer(
            "сколько вышло",
            Facts(earned: 0m, hours: 0, tips: 0m, revenue: 0m) with { Shifts = 0, Period = "этот день" });

        Assert.Equal("За этот день отработанных смен нет.", answer);
    }

    [Fact]
    public void ANamedDayIsOneDayRatherThanItsWholeMonth()
    {
        var (from, to) = Period("сколько было 14 января");

        Assert.Equal(new DateOnly(2026, 1, 14), from);
        Assert.Equal(new DateOnly(2026, 1, 14), to);
    }

    [Fact]
    public void ADayThatCannotExistFallsBackToTheMonth()
    {
        // No 31st of February; the question is about February all the same.
        var (from, to) = Period("31 февраля");

        Assert.Equal(new DateOnly(2026, 2, 1), from);
        Assert.Equal(new DateOnly(2026, 2, 28), to);
    }

    [Fact]
    public void ABareMonthStaysAWholeMonth()
    {
        var (from, to) = Period("а в январе?");

        Assert.Equal(new DateOnly(2026, 1, 1), from);
        Assert.Equal(new DateOnly(2026, 1, 31), to);
    }

    [Fact]
    public void TheBestTippingDayIsAnsweredSeparatelyFromTheMonthsTotal()
    {
        var answer = Flat(AssistantWriter.Answer("в какой день лучше чай?", Facts()));

        Assert.Contains("пятницу", answer);
        Assert.Contains("640", answer);
        // Not the month's total, which the plain tips question would give.
        Assert.DoesNotContain("300", answer);
    }

    [Fact]
    public void WithNoTipsRecordedItSaysThereIsNothingToCompare()
    {
        var answer = AssistantWriter.Answer(
            "какой день недели лучший на чай",
            Facts() with { BestTipWeekday = null, BestTipAverage = 0m });

        Assert.Contains("нечего", answer);
    }

    // ==== Two currencies cannot be one sentence ====

    [Fact]
    public void AMixedPeriodRefusesToNameOneTotal()
    {
        var answer = AssistantWriter.Answer(
            "сколько я заработал",
            Facts() with
            {
                Currencies = ["PLN", "UAH"],
                Places = [new AssistantPlace("Ночной бар", 8, 2_050m, "UAH"), new AssistantPlace("Bar Wroclaw", 16, 640m, "PLN")],
            });

        Assert.Contains("разных валютах", answer);
        // Each place in its own currency: 640 zloty must not read as 640 ₴.
        Assert.Contains("640 PLN", Flat(answer));
        Assert.Contains("2 050 ₴", Flat(answer));
        // The plain sum would be hryvnia and zloty added as if they matched.
        Assert.DoesNotContain("18 140", Flat(answer));
    }

    [Fact]
    public void OneCurrencyStillGetsItsTotal()
    {
        var answer = Flat(AssistantWriter.Answer("сколько я заработал", Facts()));

        Assert.Contains("18 140", answer);
    }
}
