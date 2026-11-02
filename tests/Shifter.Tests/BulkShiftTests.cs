using Shifter.Application.Common.Exceptions;
using Shifter.Application.Common.Time;
using Shifter.Application.Features.business.DTOs;
using Shifter.Application.Features.business.Services;
using Shifter.Domain.Entities;

using Xunit;

namespace Shifter.Tests;

/// <summary>Painting one template across many days.</summary>
public class BulkShiftTests
{
    /// <summary>A template with the automatic clock off, which still goes by the date alone.</summary>
    private const int Manual = 8;

    private readonly FakeShifterQuery _query = new();
    private readonly FakeShifterCommand _command;
    private readonly DayHandler _handler;

    public BulkShiftTests()
    {
        _command = new FakeShifterCommand(_query);
        _query.Shifts.Add(Build.Template(7));

        Shift manual = Build.Template(Manual);

        manual.AutoClock = false;
        _query.Shifts.Add(manual);

        _handler = new DayHandler(_command, _query);
    }

    private Task<DayDto[]> Apply(string[] dates, string mode = "add", int shiftId = 7)
        => _handler.BulkAsync(
            new BulkShiftDto(dates.Select(DateOnly.Parse).ToArray(), shiftId, mode),
            Build.UserId,
            CancellationToken.None);

    /// <summary>Whether the 09:00 to 17:00 template comes out worked when painted at this moment.</summary>
    private async Task<bool> WorkedAt(string instant, string date)
    {
        AppClock clock = new(time: new FixedTime(DateTimeOffset.Parse(instant)));
        DayHandler handler = new(_command, _query, clock: clock);

        DayDto[] days = await handler.BulkAsync(
            new BulkShiftDto([DateOnly.Parse(date)], 7, "add"),
            Build.UserId,
            CancellationToken.None);

        return days.Single().shifts.Single().worked;
    }

    [Fact]
    public async Task ADayBehindUsIsWorked()
    {
        DateOnly yesterday = new AppClock().Today.AddDays(-1);

        DayDto[] days = await Apply([yesterday.ToString("yyyy-MM-dd")]);

        Assert.True(days.Single().shifts.Single().worked);
    }

    [Fact]
    public async Task TodayIsWorkedWhereTheWorkHappens()
    {
        // The one the UTC date got wrong, every evening, for three hours.
        DateOnly today = new AppClock().Today;

        DayDto[] days = await Apply([today.ToString("yyyy-MM-dd")], shiftId: Manual);

        Assert.True(days.Single().shifts.Single().worked);
    }

    [Fact]
    public async Task OnTheAutomaticClockTodayStaysAPlanUntilItIsOver()
    {
        // 16:30 and 17:30 in Kyiv, in summer.
        Assert.False(await WorkedAt("2026-08-04T13:30:00Z", "2026-08-04"));
        Assert.True(await WorkedAt("2026-08-04T14:30:00Z", "2026-08-04"));
    }

    [Fact]
    public async Task TheCloseIsReadOnTheHoursOfThatWeekday()
    {
        // Tuesday runs late here, so 17:30 is still inside it.
        _query.Shifts.Single(shift => shift.Id == 7).WeekHours =
            [new WeekdayHours { Weekday = 2, StartTime = new TimeOnly(9, 0), EndTime = new TimeOnly(20, 0) }];

        Assert.False(await WorkedAt("2026-08-04T14:30:00Z", "2026-08-04"));
    }

    [Fact]
    public async Task ADayAheadOfUsIsOnlyAPlan()
    {
        DateOnly ahead = new AppClock().Today.AddDays(9);

        DayDto[] days = await Apply([ahead.ToString("yyyy-MM-dd")]);

        Assert.False(days.Single().shifts.Single().worked);
    }

    [Fact]
    public async Task AStrokeAcrossTodayIsSplitAtTheRightPlace()
    {
        DateOnly today = new AppClock().Today;
        string[] dates =
        [
            today.AddDays(-2).ToString("yyyy-MM-dd"),
            today.ToString("yyyy-MM-dd"),
            today.AddDays(2).ToString("yyyy-MM-dd"),
        ];

        DayDto[] days = await Apply(dates, shiftId: Manual);

        Assert.Equal(2, days.Count(day => day.shifts.Single().worked));
        Assert.Single(days, day => !day.shifts.Single().worked);
    }

    [Fact]
    public async Task NoDatesIsRefusedRatherThanIgnored()
        => await Assert.ThrowsAsync<ValidationException>(() => Apply([]));

    [Fact]
    public async Task AModeNobodyDefinedIsRefused()
        => await Assert.ThrowsAsync<ValidationException>(
            () => Apply(["2026-08-04"], "paint"));

    [Fact]
    public async Task ATemplateThatIsNotYoursIsNotFound()
        => await Assert.ThrowsAsync<NotFoundException>(
            () => _handler.BulkAsync(
                new BulkShiftDto([DateOnly.Parse("2026-08-04")], 999, "add"),
                Build.UserId,
                CancellationToken.None));

    [Fact]
    public async Task MoreThanFourHundredDatesIsRefused()
    {
        string[] dates = Enumerable.Range(0, 401)
            .Select(at => DateOnly.Parse("2020-01-01").AddDays(at).ToString("yyyy-MM-dd"))
            .ToArray();

        await Assert.ThrowsAsync<ValidationException>(() => Apply(dates));
    }
}
