using Shifter.Application.Common.Exceptions;
using Shifter.Application.Features.business.DTOs;
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

        Assert.False(Assert.Single(cells).Filled);
    }

    [Fact]
    public void ACellWithNoHoursIsADayWithNoSetTime()
    {
        var cells = RosterRules.ReadBatch(new RosterCellsDto(
            [
                new RosterCellSetDto(1, "2026-11-02", null, null),
                new RosterCellSetDto(1, "2026-11-03", "11:00", "22:00") with { start_time = null, end_time = null },
            ],
            null));

        Assert.Equal(2, cells.Length);
        Assert.All(cells, cell =>
        {
            Assert.True(cell.Filled);
            Assert.Null(cell.Start);
            Assert.Null(cell.End);
        });
    }

    [Theory]
    [InlineData("11:00", null)]
    [InlineData(null, "22:00")]
    public void HalfAPairOfHoursIsRefused(string? start, string? end)
    {
        var refused = Assert.Throws<ValidationException>(() => RosterRules.ReadBatch(new RosterCellsDto(
            [new RosterCellSetDto(1, "2026-11-02", start, end)], null)));

        Assert.Equal("start_time and end_time come together.", refused.Message);
    }

    [Fact]
    public void AClearAfterANoTimeSetOfTheSameCellEmptiesIt()
    {
        var cell = Assert.Single(RosterRules.ReadBatch(new RosterCellsDto(
            [new RosterCellSetDto(1, "2026-11-02", null, null)],
            [new RosterCellClearDto(1, "2026-11-02")])));

        Assert.False(cell.Filled);
    }

    [Fact]
    public void ANoTimeSetAfterATimedOneOfTheSameCellWins()
    {
        var cell = Assert.Single(RosterRules.ReadBatch(new RosterCellsDto(
            [
                new RosterCellSetDto(1, "2026-11-02", "11:00", "22:00"),
                new RosterCellSetDto(1, "2026-11-02", null, null),
            ],
            null)));

        Assert.True(cell.Filled);
        Assert.Null(cell.Start);
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

    // ==== Usual hours, positions and usual days ====

    private static WeekHoursDto Day(int weekday, string start = "12:00", string end = "00:00")
        => new(weekday, start, end);

    private static string Refusal(Action save) => Assert.Throws<ValidationException>(save).Message;

    private static RosterPerson Person(int id = 1) => new() { Id = id, Name = "Толик", Colour = "#4488cc" };

    [Theory]
    [InlineData(0)]
    [InlineData(8)]
    public void WeekHoursOutsideOneToSevenAreRefused(int weekday)
        => Assert.Equal("weekday must be from 1 to 7.", Refusal(() => RosterRules.ReadWeek([Day(weekday)])));

    [Fact]
    public void AWeekdayListedTwiceIsRefused()
        => Assert.Equal(
            "A weekday is listed more than once.",
            Refusal(() => RosterRules.ReadWeek([Day(5), Day(1), Day(5, "18:00", "04:00")])));

    [Fact]
    public void WeekHoursThatStartAndEndTogetherAreRefused()
    {
        Assert.Equal("Start and end time must differ.", Refusal(() => RosterRules.ReadWeek([Day(1, "12:00", "12:00")])));
        Assert.Equal("start_time must be HH:mm.", Refusal(() => RosterRules.ReadWeek([Day(1, "25:00")])));
        Assert.Equal("end_time must be HH:mm.", Refusal(() => RosterRules.ReadWeek([new WeekHoursDto(1, "12:00", null!)])));
    }

    [Fact]
    public void WeekHoursComeOutInWeekdayOrder()
    {
        var week = RosterRules.ReadWeek([Day(7, "11:00", "19:00"), Day(1), Day(5, "12:00", "02:00")]);

        Assert.Equal([1, 5, 7], week.Select(entry => entry.Weekday));
        Assert.Equal([1, 5, 7], RosterRules.WeekDto(week).Select(entry => entry.weekday));
        Assert.Equal("02:00", RosterRules.WeekDto(week)[1].end_time);
        Assert.Empty(RosterRules.ReadWeek(null));
    }

    [Fact]
    public void APositionNameIsTrimmedRequiredAndMeasured()
    {
        Assert.Equal("Бар", RosterRules.ReadPositionName("  Бар "));
        Assert.Equal(new string('я', 40), RosterRules.ReadPositionName($" {new string('я', 40)} "));

        Assert.Equal("Position is required.", Refusal(() => RosterRules.ReadPositionName("   ")));
        Assert.Equal("Position is required.", Refusal(() => RosterRules.ReadPositionName(null)));
        Assert.Equal(
            "Position must be at most 40 characters.",
            Refusal(() => RosterRules.ReadPositionName(new string('я', RosterPosition.NameMax + 1))));

        Assert.Equal(RosterRules.PositionKey(" бар "), RosterRules.PositionKey("БАР"));
    }

    [Fact]
    public void APositionNameWithAControlCharacterIsRefused()
        => Assert.Equal(
            "Position holds a character that cannot be shown.",
            Refusal(() => RosterRules.ReadPositionName("Бар\u0007")));

    [Theory]
    [InlineData("Venue")]
    [InlineData("")]
    [InlineData(null)]
    [InlineData("inherit")]
    public void PositionHoursModesAreTheThreeAndNoOther(string? mode)
    {
        var position = new RosterPosition { Name = "Бар" };

        Assert.Equal(
            "hours.mode must be none, own or venue.",
            Refusal(() => RosterRules.ApplyPositionHours(position, new RosterHoursDto(mode, null, null, null))));

        RosterRules.ApplyPositionHours(position, new RosterHoursDto("own", "18:00", "02:00", null));

        Assert.Equal(RosterHoursMode.Own, position.HoursMode);
        Assert.Empty(position.WeekHours);

        // Venue and none keep no hours of their own, whatever came with them.
        RosterRules.ApplyPositionHours(position, new RosterHoursDto("venue", "18:00", "02:00", [Day(5)]));

        Assert.Equal(RosterHoursMode.Venue, position.HoursMode);
        Assert.Null(position.StartTime);
        Assert.Empty(position.WeekHours);
    }

    [Theory]
    [InlineData("Inherit")]
    [InlineData("none")]
    [InlineData("venue")]
    [InlineData(null)]
    public void PersonHoursModesAreInheritAndOwn(string? mode)
        => Assert.Equal(
            "hours.mode must be inherit or own.",
            Refusal(() => RosterRules.ApplyPersonHours(Person(), new RosterHoursDto(mode, "09:00", "17:00", null))));

    [Fact]
    public void OwnHoursWithAMissingTimeSayWhichOne()
    {
        Assert.Equal(
            "start_time must be HH:mm.",
            Refusal(() => RosterRules.ApplyPersonHours(Person(), new RosterHoursDto("own", null, "17:00", null))));
        Assert.Equal(
            "end_time must be HH:mm.",
            Refusal(() => RosterRules.ApplyPersonHours(Person(), new RosterHoursDto("own", "09:00", null, null))));
        Assert.Equal(
            "Start and end time must differ.",
            Refusal(() => RosterRules.ApplyPositionHours(
                new RosterPosition { Name = "Бар" }, new RosterHoursDto("own", "09:00", "09:00", null))));

        // A refused save leaves the hours as they were.
        var person = Person();

        RosterRules.ApplyPersonHours(person, new RosterHoursDto("own", "09:00", "17:00", [Day(6, "10:00", "15:00")]));

        Assert.Throws<ValidationException>(() => RosterRules.ApplyPersonHours(
            person, new RosterHoursDto("own", "10:00", "18:00", [Day(9)])));

        Assert.Equal(new TimeOnly(9, 0), person.StartTime);
        Assert.Single(person.WeekHours);
    }

    [Theory]
    [InlineData(null)]
    [InlineData(new int[0])]
    public void UsualWeekdaysNeedAtLeastOneAndNoRepeats(int[]? weekdays)
    {
        Assert.Equal(
            "Usual days need at least one weekday.",
            Refusal(() => RosterRules.ApplyPattern(Person(), new RosterPatternDto("weekdays", weekdays, null, null, null))));
        Assert.Equal(
            "A weekday is listed more than once.",
            Refusal(() => RosterRules.ApplyPattern(Person(), new RosterPatternDto("weekdays", [1, 3, 1], null, null, null))));
        Assert.Equal(
            "weekday must be from 1 to 7.",
            Refusal(() => RosterRules.ApplyPattern(Person(), new RosterPatternDto("weekdays", [0], null, null, null))));
        Assert.Equal(
            "pattern.kind must be none, weekdays or cycle.",
            Refusal(() => RosterRules.ApplyPattern(Person(), new RosterPatternDto("Weekdays", [1], null, null, null))));

        var person = Person();

        RosterRules.ApplyPattern(person, new RosterPatternDto("weekdays", [7, 1, 5], 2, 2, "2026-11-03"));

        Assert.Equal([1, 5, 7], person.PatternWeekdays!);
        Assert.Null(person.CycleOn);
        Assert.Null(person.CycleFrom);
    }

    [Theory]
    [InlineData(0, 2, false)]
    [InlineData(29, 2, false)]
    [InlineData(2, 0, false)]
    [InlineData(2, 29, false)]
    [InlineData(null, 2, false)]
    [InlineData(2, null, false)]
    [InlineData(1, 28, true)]
    [InlineData(28, 1, true)]
    public void ACycleRunsOneToTwentyEightEachWay(int? on, int? off, bool takes)
    {
        var person = Person();
        var pattern = new RosterPatternDto("cycle", [1, 2], on, off, "2026-11-03");

        if (!takes)
        {
            Assert.Equal(
                "A cycle runs 1 to 28 days on and 1 to 28 days off.",
                Refusal(() => RosterRules.ApplyPattern(person, pattern)));

            return;
        }

        RosterRules.ApplyPattern(person, pattern);

        Assert.Equal((on, off, new DateOnly(2026, 11, 3)), (person.CycleOn, person.CycleOff, person.CycleFrom));
        Assert.Null(person.PatternWeekdays);
    }

    [Theory]
    [InlineData(null, "from must be yyyy-MM-dd.")]
    [InlineData("2026-11-31", "from must be yyyy-MM-dd.")]
    [InlineData("03.11.2026", "from must be yyyy-MM-dd.")]
    [InlineData("1999-12-31", "That date is outside what a roster can hold.")]
    [InlineData("2101-01-01", "That date is outside what a roster can hold.")]
    public void ACycleNeedsADateItCanHold(string? from, string message)
        => Assert.Equal(
            message,
            Refusal(() => RosterRules.ApplyPattern(Person(), new RosterPatternDto("cycle", null, 2, 2, from))));

    [Fact]
    public void ACycleCountsBackwardsFromItsFirstDay()
    {
        // 2/2 from Thursday the 12th: the 10th and 11th were the two days off
        // before it, the 8th and 9th the two on before those.
        var person = Person();

        RosterRules.ApplyPattern(person, new RosterPatternDto("cycle", null, 2, 2, "2026-11-12"));

        var worked = Enumerable.Range(1, 16)
            .Select(day => new DateOnly(2026, 11, day))
            .Where(date => RosterRules.WorksOn(person, date))
            .Select(date => date.Day);

        Assert.Equal([1, 4, 5, 8, 9, 12, 13, 16], worked);
    }

    private static RosterPerson OnFridays()
    {
        var person = Person();

        RosterRules.ApplyPattern(person, new RosterPatternDto("weekdays", [5], null, null, null));

        return person;
    }

    [Fact]
    public void AMonthAlreadyOverPlansNothing()
    {
        var plan = RosterRules.PlanFill(
            [OnFridays()], [], [], new DateOnly(2026, 10, 1), new DateOnly(2026, 11, 1), new HashSet<(int, DateOnly)>());

        Assert.Empty(plan.Add);
        Assert.Equal((0, 0), (plan.Kept, plan.Skipped));
    }

    [Fact]
    public void TheCurrentMonthIsPlannedFromToday()
    {
        // Friday the 13th is today, so it is the first Friday planned; the 6th is gone.
        var plan = RosterRules.PlanFill(
            [OnFridays()],
            [],
            [],
            new DateOnly(2026, 11, 1),
            new DateOnly(2026, 11, 13),
            new HashSet<(int, DateOnly)> { (1, new DateOnly(2026, 11, 6)) });

        Assert.Equal([13, 20, 27], plan.Add.Select(shift => shift.Date.Day));
        Assert.All(plan.Add, shift => Assert.Null(shift.StartTime));
        Assert.Equal(0, plan.Kept);
        Assert.Equal(new DateOnly(2026, 11, 13), RosterRules.FillsFrom(new DateOnly(2026, 11, 1), new DateOnly(2026, 11, 13)));
        Assert.Equal(new DateOnly(2026, 12, 1), RosterRules.FillsFrom(new DateOnly(2026, 12, 1), new DateOnly(2026, 11, 13)));
    }

    [Fact]
    public void RestampLeavesDaysWithNoTimeAndDaysBeforeToday()
    {
        var venue = RosterRules.ReadWeek([Day(1), Day(5, "12:00", "02:00")]);
        var later = RosterRules.ReadWeek([Day(1, "14:00", "00:00"), Day(5, "12:00", "02:00")]);
        var people = new[] { Person() };

        var restamps = RosterRules.Restamps(new RosterDefaults(venue, [], people), new RosterDefaults(later, [], people));
        var restamp = Assert.Single(restamps);

        Assert.Equal((1, 1, new TimeOnly(12, 0), new TimeOnly(0, 0)), (restamp.PersonId, restamp.Weekday, restamp.OldStart, restamp.OldEnd));

        RosterShift Monday(int day, TimeOnly? start, TimeOnly? end)
            => new() { RosterPersonId = 1, Date = new DateOnly(2026, 11, day), StartTime = start, EndTime = end };

        DateOnly today = new(2026, 11, 13);

        Assert.Null(RosterRules.RestampOf(Monday(16, null, null), restamps, today));
        Assert.Null(RosterRules.RestampOf(Monday(9, new TimeOnly(12, 0), new TimeOnly(0, 0)), restamps, today));
        Assert.Null(RosterRules.RestampOf(Monday(16, new TimeOnly(13, 0), new TimeOnly(0, 0)), restamps, today));
        Assert.Equal(
            (new TimeOnly(14, 0), new TimeOnly(0, 0)),
            RosterRules.RestampOf(Monday(16, new TimeOnly(12, 0), new TimeOnly(0, 0)), restamps, today));
    }
}
