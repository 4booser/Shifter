using Shifter.Domain.Entities;

using Xunit;

namespace Shifter.Tests;

public class DayShiftTests
{
    [Fact]
    public void DurationWrapsPastMidnight()
    {
        DayShift entry = DayShift.From(
            Build.Template(1, start: "22:00", end: "06:00"), worked: true);

        Assert.Equal(TimeSpan.FromHours(8), entry.Duration);
    }

    [Fact]
    public void BreaksComeOutOfThePaidHours()
    {
        Shift template = Build.Template(1, start: "09:00", end: "17:00");
        template.Breaks = [new Break { Duration = TimeSpan.FromMinutes(30) }];

        DayShift entry = DayShift.From(template, worked: true);

        Assert.Equal(30, entry.BreakMinutes);
        Assert.Equal(TimeSpan.FromHours(7.5), entry.PaidDuration);
    }

    [Fact]
    public void ActualClockOverridesThePlan()
    {
        DayShift entry = DayShift.From(
            Build.Template(1, start: "11:00", end: "22:00", amount: 100m), worked: true);

        entry.ActualStart = new TimeOnly(10, 45);
        entry.ActualEnd = new TimeOnly(22, 30);

        Assert.Equal(TimeSpan.FromHours(11.75), entry.Duration);
        Assert.Equal(1175m, entry.Pay);
    }

    [Fact]
    public void ActualClockWrapsPastMidnightToo()
    {
        DayShift entry = DayShift.From(
            Build.Template(1, start: "17:00", end: "23:00"), worked: true);

        entry.ActualStart = new TimeOnly(17, 0);
        entry.ActualEnd = new TimeOnly(1, 0);

        Assert.Equal(TimeSpan.FromHours(8), entry.Duration);
    }

    [Fact]
    public void OneActualEdgeAloneChangesNothing()
    {
        DayShift entry = DayShift.From(
            Build.Template(1, start: "09:00", end: "17:00"), worked: true);

        entry.ActualEnd = new TimeOnly(19, 0);

        Assert.Equal(TimeSpan.FromHours(8), entry.Duration);
    }

    [Fact]
    public void BreaksLongerThanTheShiftDoNotGoNegative()
    {
        Shift template = Build.Template(1, start: "09:00", end: "10:00");
        template.Breaks = [new Break { Duration = TimeSpan.FromHours(3) }];

        DayShift entry = DayShift.From(template, worked: true);

        Assert.Equal(TimeSpan.Zero, entry.PaidDuration);
        Assert.Equal(0m, entry.Pay);
    }

    [Fact]
    public void AnHourlyShiftPaysForItsPaidHours()
    {
        DayShift entry = DayShift.From(
            Build.Template(1, amount: 250m, start: "09:00", end: "17:00"), worked: true);

        Assert.Equal(2000m, entry.Pay);
    }

    [Fact]
    public void ADailyRatePaysTheSameWhateverTheHours()
    {
        DayShift entry = DayShift.From(
            Build.Template(1, period: SalaryPeriod.Day, amount: 1500m, start: "09:00", end: "23:00"),
            worked: true);

        Assert.Equal(1500m, entry.Pay);
    }

    [Fact]
    public void WeeklyAndMonthlyWagesEarnNothingPerShift()
    {
        DayShift weekly = DayShift.From(
            Build.Template(1, period: SalaryPeriod.Week, amount: 10000m), worked: true);
        DayShift monthly = DayShift.From(
            Build.Template(2, period: SalaryPeriod.Month, amount: 40000m), worked: true);

        Assert.Equal(0m, weekly.Pay);
        Assert.Equal(0m, monthly.Pay);
        Assert.True(weekly.IsPeriodSalary);
        Assert.True(monthly.IsPeriodSalary);
    }

    /// <summary>
    /// The whole reason DayShift exists: history must not move when the
    /// template is repriced.
    /// </summary>
    [Fact]
    public void RepricingTheTemplateLeavesThePlacementAlone()
    {
        Shift template = Build.Template(1, amount: 100m);
        DayShift placed = DayShift.From(template, worked: true);

        template.SalaryAmount = 500m;
        template.StartTime = TimeOnly.Parse("06:00");

        Assert.Equal(100m, placed.SalaryAmount);
        Assert.Equal(TimeOnly.Parse("09:00"), placed.StartTime);
        Assert.Equal(800m, placed.Pay);
    }
}
