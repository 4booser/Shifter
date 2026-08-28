using Shifter.Application.Common.Exceptions;
using Shifter.Application.Common.Time;
using Shifter.Application.Features.business.DTOs;
using Shifter.Application.Features.business.Services;
using Shifter.Domain.Entities;

using Xunit;

namespace Shifter.Tests;

/// <summary>
/// Painting one template across many days.
///
/// The rule that matters is where the line between "worked" and "planned"
/// falls, and it used to be drawn on the UTC date. Between nine at night and
/// midnight in Kyiv that is still yesterday — so a bartender laying out the
/// week at the end of a shift had today filed as a plan, and the money for it
/// went missing from the month until somebody noticed and flipped it by hand.
/// </summary>
public class BulkShiftTests
{
    private readonly FakeShifterQuery _query = new();
    private readonly FakeShifterCommand _command;
    private readonly DayHandler _handler;

    public BulkShiftTests()
    {
        _command = new FakeShifterCommand(_query);
        _query.Shifts.Add(Build.Template(7));
        _handler = new DayHandler(_command, _query);
    }

    private Task<DayDto[]> Apply(string[] dates, string mode = "add")
        => _handler.BulkAsync(
            new BulkShiftDto(dates.Select(DateOnly.Parse).ToArray(), 7, mode),
            Build.UserId,
            CancellationToken.None);

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

        DayDto[] days = await Apply([today.ToString("yyyy-MM-dd")]);

        Assert.True(days.Single().shifts.Single().worked);
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

        DayDto[] days = await Apply(dates);

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
