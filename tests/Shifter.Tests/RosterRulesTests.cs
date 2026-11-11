using Shifter.Application.Common.Exceptions;
using Shifter.Application.Features.Rosters;
using Shifter.Domain.Entities;

using Xunit;

namespace Shifter.Tests;

public class RosterRulesTests
{
    private static DateOnly Date(string value) => DateOnly.ParseExact(value, "yyyy-MM-dd");

    [Theory]
    [InlineData("2026-11-02", "2026-10-05")]
    [InlineData("2026-11-01", "2026-10-04")]
    [InlineData("2026-11-30", "2026-10-26")]
    [InlineData("2026-11-29", "2026-10-25")]
    public void TheNthWeekdayComesFromTheNthWeekday(string target, string source)
        => Assert.Equal(Date(source), RosterRules.SourceOf(Date(target)));

    [Fact]
    public void AYearEndCrossesWithoutLosingItsWeekday()
        => Assert.Equal(Date("2026-12-07"), RosterRules.SourceOf(Date("2027-01-04")));

    [Fact]
    public void AMarchAfterAShortFebruaryFallsBackToItsLastWeekday()
        // February 2027 has four of everything; March the 29th is the fifth Monday.
        => Assert.Equal(Date("2027-02-22"), RosterRules.SourceOf(Date("2027-03-29")));

    [Theory]
    [InlineData("2026-10")]
    [InlineData("2027-01")]
    [InlineData("2027-02")]
    [InlineData("2028-02")]
    [InlineData("2028-03")]
    public void EveryDayOfAMonthTakesItsOwnWeekdayFromTheMonthBefore(string month)
    {
        DateOnly first = RosterRules.RequireMonth(month);
        DateOnly before = first.AddMonths(-1);

        for (DateOnly date = first; date <= RosterRules.LastDay(first); date = date.AddDays(1))
        {
            DateOnly source = RosterRules.SourceOf(date);

            Assert.Equal(date.DayOfWeek, source.DayOfWeek);
            Assert.Equal(before.Month, source.Month);
        }
    }

    [Fact]
    public void AMonthIsTheFirstOfItself()
        => Assert.Equal(new DateOnly(2026, 11, 1), RosterRules.TryMonth("2026-11"));

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("abc")]
    [InlineData("2026-13")]
    [InlineData("2026-1")]
    [InlineData("2026-11-01")]
    [InlineData("2026-11 ")]
    [InlineData("0001-01")]
    [InlineData("9999-12")]
    public void AnythingElseNamesNoMonth(string? value)
    {
        Assert.Null(RosterRules.TryMonth(value));
        Assert.Throws<ValidationException>(() => RosterRules.RequireMonth(value));
    }

    [Fact]
    public void BothEndsOfTheWindowHaveAMonthBeyondThem()
    {
        Assert.Equal(new DateOnly(1999, 12, 1), RosterRules.FirstMonth.AddMonths(-1));
        Assert.Equal(new DateOnly(2101, 1, 1), RosterRules.LastMonth.AddMonths(1));
    }

    [Theory]
    [InlineData(11, 0, 22, 0, "11-22")]
    [InlineData(11, 30, 22, 0, "11:30-22")]
    [InlineData(9, 5, 17, 45, "9:05-17:45")]
    [InlineData(22, 0, 6, 0, "22-6")]
    [InlineData(18, 0, 0, 0, "18-24")]
    [InlineData(0, 0, 8, 0, "0-8")]
    public void HoursAreWrittenTheWayACrewWritesThem(
        int startHour, int startMinute, int endHour, int endMinute, string expected)
        => Assert.Equal(
            expected,
            RosterRules.Compact(new TimeOnly(startHour, startMinute), new TimeOnly(endHour, endMinute)));

    [Fact]
    public void TextIsTrimmedBeforeItIsMeasured()
    {
        Assert.Equal("Июль", RosterRules.CleanTitle("  Июль  "));
        Assert.Equal(new string('я', 60), RosterRules.CleanTitle($" {new string('я', 60)} "));
        Assert.Equal(new string('я', 40), RosterRules.CleanName($" {new string('я', 40)} "));
    }

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("   ")]
    public void ATitleAndANameHaveToSaySomething(string? value)
    {
        Assert.Throws<ValidationException>(() => RosterRules.CleanTitle(value));
        Assert.Throws<ValidationException>(() => RosterRules.CleanName(value));
    }

    [Fact]
    public void TextPastItsLimitIsRefused()
    {
        Assert.Throws<ValidationException>(() => RosterRules.CleanTitle(new string('я', Roster.TitleMax + 1)));
        Assert.Throws<ValidationException>(() => RosterRules.CleanName(new string('я', RosterPerson.NameMax + 1)));
        Assert.Throws<ValidationException>(() => RosterRules.CleanPosition(new string('я', RosterPerson.PositionMax + 1)));
    }

    [Fact]
    public void AControlCharacterNeverReachesTheDatabase()
    {
        Assert.Throws<ValidationException>(() => RosterRules.CleanName("Тол\0ик"));
        Assert.Throws<ValidationException>(() => RosterRules.CleanTitle("Июль\nАвгуст"));
        Assert.Throws<ValidationException>(() => RosterRules.CleanPosition("Бар\u0007"));
    }

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("   ")]
    public void AnEmptyPositionIsNoPosition(string? value)
        => Assert.Null(RosterRules.CleanPosition(value));

    [Theory]
    [InlineData("#1f3a5f", "#1f3a5f")]
    [InlineData("#1F3A5F", "#1f3a5f")]
    [InlineData(" #abcdef ", "#abcdef")]
    public void AColourIsKeptLowerCase(string value, string expected)
        => Assert.Equal(expected, RosterRules.RequireColour(value));

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("red")]
    [InlineData("#abc")]
    [InlineData("#abcdefg")]
    [InlineData("#gggggg")]
    [InlineData("abcdef#")]
    [InlineData("#abcdef;background:url(x)")]
    public void AnythingElseIsNotAColour(string? value)
        => Assert.Throws<ValidationException>(() => RosterRules.RequireColour(value));

    [Theory]
    [InlineData("#ABCDEF")]
    [InlineData("#abcde\n")]
    [InlineData("#abcdef\n")]
    public void TheCheckOnTheWayOutTakesNothingOnTrust(string value)
        => Assert.False(RosterRules.IsColour(value));

    [Fact]
    public void ACellNamedTwiceEndsAsItsLastEntrySays()
    {
        var cells = RosterRules.ReadBatch(new RosterCellsDto(
            [
                new RosterCellSetDto(1, "2026-11-02", "11:00", "22:00"),
                new RosterCellSetDto(1, "2026-11-02", "12:00", "23:00"),
            ],
            []));

        var cell = Assert.Single(cells);

        Assert.Equal(new TimeOnly(12, 0), cell.Start);
        Assert.Equal(new TimeOnly(23, 0), cell.End);
    }

    [Fact]
    public void AClearIsReadAfterASetOfTheSameCell()
    {
        var cells = RosterRules.ReadBatch(new RosterCellsDto(
            [new RosterCellSetDto(1, "2026-11-02", "11:00", "22:00")],
            [new RosterCellClearDto(1, "2026-11-02")]));

        Assert.Null(Assert.Single(cells).Start);
    }

    [Fact]
    public void AnOvernightShiftIsAShiftNotAnError()
    {
        var cell = Assert.Single(RosterRules.ReadBatch(new RosterCellsDto(
            [new RosterCellSetDto(1, "2026-11-02", "22:00", "06:00")], null)));

        Assert.True(cell.End < cell.Start);
    }

    [Theory]
    [InlineData("2026-11-31", "11:00", "22:00")]
    [InlineData("02.11.2026", "11:00", "22:00")]
    [InlineData(null, "11:00", "22:00")]
    [InlineData("0001-01-01", "11:00", "22:00")]
    [InlineData("9999-12-31", "11:00", "22:00")]
    [InlineData("2026-11-02", "25:00", "22:00")]
    [InlineData("2026-11-02", "9:00", "22:00")]
    [InlineData("2026-11-02", "11:00:00", "22:00")]
    [InlineData("2026-11-02", "11:00", null)]
    [InlineData("2026-11-02", "11:00", "11:00")]
    public void OneBadEntryRefusesTheBatch(string? date, string? start, string? end)
        => Assert.Throws<ValidationException>(() => RosterRules.ReadBatch(new RosterCellsDto(
            [
                new RosterCellSetDto(1, "2026-11-03", "11:00", "22:00"),
                new RosterCellSetDto(1, date, start, end),
            ],
            null)));

    [Fact]
    public void ABatchHasACeilingCountedAcrossBothLists()
    {
        var set = Enumerable.Range(0, 300)
            .Select(day => (RosterCellSetDto?)new RosterCellSetDto(
                1, new DateOnly(2026, 1, 1).AddDays(day).ToString("yyyy-MM-dd"), "11:00", "22:00"))
            .ToArray();

        var clear = Enumerable.Range(0, 200)
            .Select(day => (RosterCellClearDto?)new RosterCellClearDto(
                2, new DateOnly(2026, 1, 1).AddDays(day).ToString("yyyy-MM-dd")))
            .ToArray();

        Assert.Equal(RosterRules.BatchMax, RosterRules.ReadBatch(new RosterCellsDto(set, clear)).Length);

        Assert.Throws<ValidationException>(() => RosterRules.ReadBatch(
            new RosterCellsDto(set, [.. clear, new RosterCellClearDto(3, "2026-11-02")])));
    }

    [Fact]
    public void NoBodyAndAHoleInAListAreRefused()
    {
        Assert.Throws<ValidationException>(() => RosterRules.ReadBatch(null));
        Assert.Throws<ValidationException>(() => RosterRules.ReadBatch(new RosterCellsDto([null], null)));
        Assert.Throws<ValidationException>(() => RosterRules.ReadBatch(new RosterCellsDto(null, [null])));
    }
}
