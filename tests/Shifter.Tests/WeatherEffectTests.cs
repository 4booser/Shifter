using Shifter.Domain.Entities;

using Xunit;

namespace Shifter.Tests;

/// <summary>
/// The rain question, which everybody in the trade has an opinion about and
/// nobody has ever checked. The rules here are all about refusing to answer.
/// </summary>
public class WeatherEffectTests
{
    private static WeatherEffect.DayFigures Day(int index, decimal tips, bool wet, double hours = 8)
        => new(new DateOnly(2026, 1, 1).AddDays(index), tips, hours, wet);

    private static List<WeatherEffect.DayFigures> Days(
        int wetCount, decimal wetTips, int dryCount, decimal dryTips)
    {
        List<WeatherEffect.DayFigures> days = [];

        for (var index = 0; index < wetCount; index += 1) days.Add(Day(index, wetTips, true));
        for (var index = 0; index < dryCount; index += 1) days.Add(Day(100 + index, dryTips, false));

        return days;
    }

    [Fact]
    public void ItSaysNothingWithoutEnoughWetDays()
    {
        // Three wet nights is an anecdote. Answering from it would hand
        // somebody a fact-shaped version of the thing they already believed.
        Assert.Null(WeatherEffect.Read(Days(3, 400m, 40, 800m)));
    }

    [Fact]
    public void ItSaysNothingWithoutEnoughDryDaysEither()
    {
        // The comparison needs both sides. Somebody who only ever worked
        // through a wet autumn has no dry record to read the autumn against.
        Assert.Null(WeatherEffect.Read(Days(40, 400m, 3, 800m)));
    }

    [Fact]
    public void ItReadsTheGapWhereBothSidesAreThere()
    {
        var verdict = WeatherEffect.Read(Days(10, 656m, 10, 800m))!;

        Assert.Equal(10, verdict.WetDays);
        Assert.Equal(10, verdict.DryDays);
        Assert.Equal(82m, verdict.WetPerHour);
        Assert.Equal(100m, verdict.DryPerHour);
        Assert.Equal(-18, verdict.Percent);
        Assert.True(verdict.Worth);
    }

    [Fact]
    public void ASmallGapIsReadButNotWorthSaying()
    {
        // Tips swing five per cent between two dry Fridays. The number is
        // still returned — it is true — but flagged as not worth a sentence,
        // so no screen can dress noise up as a finding.
        var verdict = WeatherEffect.Read(Days(10, 760m, 10, 800m))!;

        Assert.Equal(-5, verdict.Percent);
        Assert.False(verdict.Worth);
    }

    [Fact]
    public void ItComparesPerHourRatherThanPerDay()
    {
        // A rainy Sunday double earning more than a dry four-hour lunch is not
        // evidence that rain pays. Per-day arithmetic would say it was.
        List<WeatherEffect.DayFigures> days = [];

        for (var index = 0; index < 10; index += 1) days.Add(Day(index, 900m, true, hours: 12));
        for (var index = 0; index < 10; index += 1) days.Add(Day(100 + index, 400m, false, hours: 4));

        var verdict = WeatherEffect.Read(days)!;

        Assert.Equal(75m, verdict.WetPerHour);
        Assert.Equal(100m, verdict.DryPerHour);
        Assert.Equal(-25, verdict.Percent);
    }

    [Fact]
    public void DaysNobodyWorkedAreNotEvidence()
    {
        // A day off in the rain earned nothing, and letting it into the wet
        // average would prove that rain destroys tips at every job on earth.
        List<WeatherEffect.DayFigures> days = [.. Days(10, 800m, 10, 800m)];

        for (var index = 0; index < 30; index += 1) days.Add(Day(200 + index, 0m, true, hours: 0));

        var verdict = WeatherEffect.Read(days)!;

        Assert.Equal(10, verdict.WetDays);
        Assert.Equal(0, verdict.Percent);
        Assert.False(verdict.Worth);
    }

    [Fact]
    public void ItCanFindThatWetDaysPayBetter()
    {
        // A basement bar fills up when it rains. The feature must be able to
        // return the answer nobody expects, or it is only a way of confirming
        // what everybody already says.
        var verdict = WeatherEffect.Read(Days(10, 960m, 10, 800m))!;

        Assert.Equal(20, verdict.Percent);
        Assert.True(verdict.Worth);
    }

    [Fact]
    public void ADrySideThatEarnedNothingIsNotABaseline()
    {
        // Dividing by a zero baseline would produce an infinite improvement,
        // which is the sort of number that reaches a screen looking confident.
        Assert.Null(WeatherEffect.Read(Days(10, 500m, 10, 0m)));
    }
}

/// <summary>
/// Where the line between a wet day and a dry one is drawn. It lives in one
/// place so that two screens cannot disagree about what counts as rain.
/// </summary>
public class WetDayTests
{
    [Theory]
    [InlineData(0, false)]
    [InlineData(0.4, false)]
    [InlineData(1.9, false)]
    [InlineData(2, true)]
    [InlineData(14, true)]
    public void RainIsCountedFromWhereTheTradeWouldCountIt(double millimetres, bool wet)
    {
        var day = new DayWeather { Date = new DateOnly(2026, 3, 14), Precipitation = (decimal)millimetres };

        Assert.Equal(wet, day.Wet);
    }
}
