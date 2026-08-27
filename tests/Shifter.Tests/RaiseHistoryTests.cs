using Shifter.Application.Features.business.DTOs;
using Shifter.Application.Features.business.Services;
using Shifter.Domain.Entities;

using Xunit;

namespace Shifter.Tests;

/// <summary>
/// The date somebody last got a raise. Almost nobody can name it off the top of
/// their head, and everybody feels it — which is the whole reason for reading it
/// back out of the shifts.
/// </summary>
public class RaiseHistoryTests
{
    private static readonly DateOnly Today = new(2026, 6, 1);

    private static Day Worked(
        string date,
        decimal rate,
        SalaryPeriod period = SalaryPeriod.Hour,
        int shiftId = 1,
        bool worked = true)
        => new Day
        {
            UserId = Build.UserId,
            Date = DateOnly.Parse(date),
            Shifts =
            [
                new DayShift
                {
                    ShiftId = shiftId,
                    Shift = new Shift
                    {
                        Id = shiftId,
                        Name = "Смена",
                        UserId = Build.UserId,
                        StartTime = new TimeOnly(10, 0),
                        EndTime = new TimeOnly(18, 0),
                    },
                    SalaryPeriod = period,
                    SalaryAmount = rate,
                    StartTime = new TimeOnly(10, 0),
                    EndTime = new TimeOnly(18, 0),
                    Worked = worked,
                },
            ],
        };

    [Fact]
    public void ARateThatMovesIsRecordedWithBothNumbersAndTheDay()
    {
        RaiseDto[] history = RaiseHistory.Of(
            [Worked("2026-03-01", 180m), Worked("2026-03-12", 200m)], Today);

        RaiseDto raise = Assert.Single(history);

        Assert.Equal(new DateOnly(2026, 3, 12), raise.on);
        Assert.Equal(180m, raise.before);
        Assert.Equal(200m, raise.after);
        Assert.Equal("hour", raise.period);
        // One eight-hour shift at the new rate: 20 an hour more.
        Assert.Equal(160m, raise.worth_since);
    }

    [Fact]
    public void ARateThatNeverMovedIsNotAHistory()
    {
        Assert.Empty(RaiseHistory.Of(
            [Worked("2026-03-01", 180m), Worked("2026-03-12", 180m)], Today));
    }

    [Fact]
    public void ACutIsReportedAsOneToo()
    {
        // The number goes negative rather than the row disappearing. A pay cut
        // is the case this is most worth having.
        RaiseDto raise = Assert.Single(RaiseHistory.Of(
            [Worked("2026-03-01", 200m), Worked("2026-03-12", 180m)], Today));

        Assert.Equal(-160m, raise.worth_since);
    }

    [Fact]
    public void ChangingFromAnHourlyRateToADailyOneIsNotAPayChange()
    {
        // 200 an hour and 200 a day are not a cut of nothing — they are two
        // different deals, and calling that a pay change would be a lie told
        // with real numbers.
        Assert.Empty(RaiseHistory.Of(
            [
                Worked("2026-03-01", 200m),
                Worked("2026-03-12", 200m, SalaryPeriod.Day),
            ],
            Today));
    }

    [Fact]
    public void OnlyShiftsActuallyWorkedCount()
    {
        // A rate typed onto a future shift is a plan, and a plan is not a
        // raise until somebody has been paid it.
        Assert.Empty(RaiseHistory.Of(
            [Worked("2026-03-01", 180m), Worked("2026-03-12", 200m, worked: false)], Today));
    }

    [Fact]
    public void EachTemplateKeepsItsOwnHistory()
    {
        // Two jobs whose rates crossed on paper never happened: they are
        // different deals with different people.
        RaiseDto[] history = RaiseHistory.Of(
            [
                Worked("2026-03-01", 180m, shiftId: 1),
                Worked("2026-03-02", 300m, shiftId: 2),
                Worked("2026-03-12", 200m, shiftId: 1),
                Worked("2026-03-13", 300m, shiftId: 2),
            ],
            Today);

        RaiseDto raise = Assert.Single(history);

        Assert.Equal(1, raise.shift_id);
        Assert.Equal(81, raise.days_ago);
    }
}
