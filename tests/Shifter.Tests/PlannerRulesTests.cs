using Shifter.Application.Common.Exceptions;
using Shifter.Application.Features.Teams.Services;
using Shifter.Domain.Entities;

using Xunit;

namespace Shifter.Tests;

public class PlannerRulesTests
{
    [Fact]
    public void ParsesACleanSlot()
    {
        var (date, start, end) = PlannerRules.ParseSlot("2026-09-01", "11:00", "22:00");

        Assert.Equal(new DateOnly(2026, 9, 1), date);
        Assert.Equal(new TimeOnly(11, 0), start);
        Assert.Equal(new TimeOnly(22, 0), end);
    }

    [Fact]
    public void OvernightIsASlotNotAnError()
    {
        var (_, start, end) = PlannerRules.ParseSlot("2026-09-01", "22:00", "06:00");

        Assert.True(end < start);
    }

    [Theory]
    [InlineData("1 сентября", "11:00", "22:00")]
    [InlineData("2026-09-01", "11am", "22:00")]
    [InlineData("2026-09-01", "11:00", "11:00")]
    public void RefusesWhatItCannotPlan(string date, string start, string end)
        => Assert.Throws<ValidationException>(() => PlannerRules.ParseSlot(date, start, end));

    [Fact]
    public void TitleIsTrimmedAndBounded()
    {
        Assert.Equal("Bar", PlannerRules.CleanTitle("  Bar  "));
        Assert.Throws<ValidationException>(() => PlannerRules.CleanTitle("   "));
        Assert.Throws<ValidationException>(() => PlannerRules.CleanTitle(new string('x', 61)));
    }

    // ==== Which station a cell covers ====

    [Theory]
    [InlineData("bar", PlanRole.Bar)]
    [InlineData("Kitchen", PlanRole.Kitchen)]
    [InlineData("  FLOOR ", PlanRole.Floor)]
    [InlineData("manager", PlanRole.Manager)]
    public void AKnownStationIsRead(string given, PlanRole expected)
    {
        Assert.Equal(expected, PlannerRules.ParseRole(given));
    }

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("бар")]
    [InlineData("sommelier")]
    public void AnythingElseIsUnsetRatherThanGuessed(string? given)
    {
        // A title is what a house calls the shift and differs between houses;
        // guessing a station from it would put people in the wrong column.
        Assert.Equal(PlanRole.Unset, PlannerRules.ParseRole(given));
    }

    // ==== The note beside a blocked day ====

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("   ")]
    public void ABlockedDayNeedsNoReason(string? given)
    {
        // People mark a day and move on. This used to be sent through the
        // title cleaner, which exists to reject an empty title, so blocking a
        // day without saying why threw and answered 500.
        Assert.Null(PlannerRules.CleanReason(given));
    }

    [Fact]
    public void AReasonIsKeptAndTrimmed()
    {
        Assert.Equal("экзамен", PlannerRules.CleanReason("  экзамен  "));
    }

    [Fact]
    public void ALongReasonIsCutRatherThanRejected()
    {
        // A day off is not worth losing over a long note.
        var cut = PlannerRules.CleanReason(new string('я', 200));

        Assert.Equal(PlannerRules.TitleMax, cut?.Length);
    }
}
