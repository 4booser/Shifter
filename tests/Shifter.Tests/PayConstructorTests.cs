using Shifter.Application.Features.business.DTOs;
using Shifter.Application.Features.business.Services;
using Shifter.Domain.Entities;

using Xunit;

namespace Shifter.Tests;

/// <summary>
/// A rate and a percentage are two halves of one deal in hospitality, and
/// pooled tips are a slice of a number nobody types in per person. The tests
/// here pin the arithmetic that turns those agreements into money.
/// </summary>
public class PayConstructorTests
{
    private static Shift Stacked(decimal? percent, decimal amount = 200m) =>
        new Shift
        {
            Id = 1,
            UserId = 1,
            Name = "Bar",
            SalaryPeriod = SalaryPeriod.Hour,
            SalaryAmount = amount,
            RevenuePercent = percent,
            StartTime = new TimeOnly(18, 0),
            EndTime = new TimeOnly(2, 0),
        };

    [Fact]
    public void PercentageIsPaidOnTopOfTheRate()
    {
        DayShift placed = DayShift.From(Stacked(3m), worked: true);
        placed.Revenue = 42_000m;

        Assert.Equal(1_600m, placed.BasePay);
        Assert.Equal(1_260m, placed.RevenuePay);
        Assert.Equal(2_860m, placed.Pay);
    }

    [Fact]
    public void PercentOnlyShiftPaysNothingUntilTheTakingsAreIn()
    {
        DayShift placed = DayShift.From(Stacked(10m, amount: 0m), worked: true);

        // Not zero takings — no takings recorded. The difference is the whole
        // reason Revenue is nullable.
        Assert.Null(placed.Revenue);
        Assert.Equal(0m, placed.Pay);

        placed.Revenue = 20_000m;

        Assert.Equal(2_000m, placed.Pay);
    }

    [Fact]
    public void ARateWithNoPercentageIsUntouched()
    {
        DayShift placed = DayShift.From(Stacked(null), worked: true);
        placed.Revenue = 50_000m;

        Assert.Equal(0m, placed.RevenuePay);
        Assert.Equal(1_600m, placed.Pay);
    }

    [Fact]
    public void PlacementKeepsTheTermsItWasPlacedUnder()
    {
        Shift template = Stacked(3m);
        template.TipSource = TipSource.Pool;
        template.TipPoolPercent = 15m;

        DayShift placed = DayShift.From(template, worked: true);

        // Later edits to the template must not rewrite what past days earned.
        template.RevenuePercent = 30m;
        template.TipPoolPercent = 90m;

        Assert.Equal(3m, placed.RevenuePercent);
        Assert.Equal(15m, placed.TipPoolPercent);
        Assert.Equal(TipSource.Pool, placed.TipSource);
    }

    // ==== Pooled tips ====

    private static (DayHandler handler, FakeShifterQuery query) Handler()
    {
        FakeShifterQuery query = new();

        return (new DayHandler(new FakeShifterCommand(query), query), query);
    }

    private static Shift Pooled(decimal share)
    {
        Shift template = Stacked(null, amount: 100m);

        template.TipSource = TipSource.Pool;
        template.TipPoolPercent = share;

        return template;
    }

    private static Task<DayDto> SaveDay(
        DayHandler handler, decimal? pool, decimal? tips, params int[] shiftIds)
        => handler.SaveAsync(
            new DaySaveDto(
                shiftIds.Select(id => new DayShiftSaveDto(id, worked: true)).ToArray(),
                null, tips, null, null, null, null, pool),
            Build.UserId,
            DateOnly.Parse("2026-03-10"),
            CancellationToken.None);

    [Fact]
    public async Task APoolIsSplitByTheAgreedShare()
    {
        (DayHandler handler, FakeShifterQuery query) = Handler();

        query.Shifts.Add(Pooled(15m));

        DayDto saved = await SaveDay(handler, pool: 9_000m, tips: null, 1);

        Assert.Equal(1_350m, saved.tips);
        Assert.Equal(9_000m, saved.tip_pool);
    }

    [Fact]
    public async Task ADerivedShareOverridesWhateverWasTypedIn()
    {
        (DayHandler handler, FakeShifterQuery query) = Handler();

        query.Shifts.Add(Pooled(10m));

        // The pool is the fact; a hand-typed figure beside it is the stale one.
        DayDto saved = await SaveDay(handler, pool: 4_000m, tips: 999m, 1);

        Assert.Equal(400m, saved.tips);
    }

    [Fact]
    public async Task PersonalTipsAreLeftAlone()
    {
        (DayHandler handler, FakeShifterQuery query) = Handler();

        query.Shifts.Add(Stacked(null));

        DayDto saved = await SaveDay(handler, pool: 5_000m, tips: 700m, 1);

        Assert.Equal(700m, saved.tips);
    }

    [Fact]
    public async Task TwoPooledShiftsOnOneDayEachTakeTheirOwnSlice()
    {
        (DayHandler handler, FakeShifterQuery query) = Handler();

        Shift morning = Pooled(10m);
        Shift evening = Pooled(15m);

        evening.Id = 2;
        query.Shifts.Add(morning);
        query.Shifts.Add(evening);

        DayDto saved = await SaveDay(handler, pool: 8_000m, tips: null, 1, 2);

        Assert.Equal(2_000m, saved.tips);
    }
}
