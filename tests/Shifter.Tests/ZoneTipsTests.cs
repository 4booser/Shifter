using Shifter.Application.Features.business.DTOs;
using Shifter.Application.Features.business.Services;
using Shifter.Domain.Entities;

using Xunit;

namespace Shifter.Tests;

/// <summary>
/// Every waiter knows the terrace tips better than the bar, and none of them
/// can say by how much — because nobody has ever written the zone down against
/// the hours.
/// </summary>
public class ZoneTipsTests
{
    private readonly FakeShifterQuery _query = new();
    private readonly DayHandler _handler;

    public ZoneTipsTests()
    {
        _handler = new DayHandler(new FakeShifterCommand(_query), _query);
    }

    private Task<DaysDto> Range()
        => _handler.ListAsync(
            Build.UserId, new DateOnly(2026, 3, 1), new DateOnly(2026, 3, 31), CancellationToken.None);

    private void Evening(string date, ShiftZone zone, decimal tips)
    {
        var place = Build.Place(1);

        if (_query.Locations.All(existing => existing.Id != place.Id)) _query.Locations.Add(place);

        var day = Build.WorkedDay(date, Build.Template(1, location: place, amount: 100m), tips: tips);

        day.Shifts![0].Zone = zone;
        _query.Days.Add(day);
    }

    [Fact]
    public async Task Tips_per_hour_is_reported_for_each_zone_that_was_named()
    {
        // Eight hours each. The terrace took twice as much.
        Evening("2026-03-02", ShiftZone.Terrace, 1_600m);
        Evening("2026-03-03", ShiftZone.Bar, 800m);

        var result = await Range();

        var terrace = result.by_zone.Single(row => row.zone == "terrace");
        var bar = result.by_zone.Single(row => row.zone == "bar");

        Assert.Equal(200m, terrace.tips_per_hour);
        Assert.Equal(100m, bar.tips_per_hour);
        // Biggest first: the answer to the argument goes at the top.
        Assert.Equal("terrace", result.by_zone[0].zone);
    }

    [Fact]
    public async Task The_zone_nobody_named_is_its_own_row_rather_than_shared_out()
    {
        // A terrace average that quietly includes every unlabelled shift is
        // not a terrace average.
        Evening("2026-03-02", ShiftZone.Terrace, 1_600m);
        Evening("2026-03-03", ShiftZone.Unset, 400m);

        var result = await Range();

        Assert.Equal(2, result.by_zone.Length);
        Assert.Contains(result.by_zone, row => row.zone == "unset");
        Assert.Equal(200m, result.by_zone.Single(row => row.zone == "terrace").tips_per_hour);
    }

    [Fact]
    public async Task A_day_split_between_two_zones_splits_its_tips_by_hours()
    {
        var place = Build.Place(1);

        _query.Locations.Add(place);

        var day = Build.WorkedDay("2026-03-02", Build.Template(1, location: place, amount: 100m), tips: 1_200m);

        day.Shifts![0].Zone = ShiftZone.Bar;
        day.Shifts.Add(DayShift.From(Build.Template(2, location: place, amount: 100m), worked: true));
        day.Shifts[1].Zone = ShiftZone.Terrace;

        _query.Days.Add(day);

        var result = await Range();

        // Two eight-hour shifts, so half the tips each. It is the only
        // division the data supports; inventing another would be deciding
        // which half of the evening earned it.
        Assert.Equal(600m, result.by_zone.Single(row => row.zone == "bar").tips);
        Assert.Equal(600m, result.by_zone.Single(row => row.zone == "terrace").tips);
    }

    [Fact]
    public async Task A_month_with_no_zones_named_still_reports_its_hours()
    {
        Evening("2026-03-02", ShiftZone.Unset, 400m);

        var result = await Range();

        var only = Assert.Single(result.by_zone);

        Assert.Equal("unset", only.zone);
        Assert.Equal(8, only.hours);
    }
}
