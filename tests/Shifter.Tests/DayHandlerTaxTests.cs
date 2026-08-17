using Shifter.Application.Features.business.DTOs;
using Shifter.Application.Features.business.Services;
using Shifter.Domain.Entities;

using Xunit;

namespace Shifter.Tests;

/// <summary>
/// Tax withheld at source, holiday pay accrued for later, and what happens when
/// two places pay in different currencies.
/// </summary>
public class DayHandlerTaxTests
{
    private readonly FakeShifterQuery _query = new();
    private readonly DayHandler _handler;

    public DayHandlerTaxTests()
    {
        _handler = new DayHandler(new FakeShifterCommand(), _query);
    }

    private Task<DaysDto> Range(string from = "2026-03-01", string to = "2026-03-31")
        => _handler.ListAsync(
            Build.UserId, DateOnly.Parse(from), DateOnly.Parse(to), CancellationToken.None);

    private Location Place(
        decimal tax = 0m,
        bool taxTips = false,
        decimal holiday = 0m,
        string currency = "",
        decimal tipOutOfTips = 0m)
    {
        Location place = Build.Place(1, tipOutOfTips: tipOutOfTips);

        place.TaxPercent = tax;
        place.TaxTips = taxTips;
        place.HolidayPercent = holiday;
        place.Currency = currency;

        _query.Locations.Add(place);

        return place;
    }

    [Fact]
    public async Task NoTaxRateLeavesNetEqualToGross()
    {
        Location place = Place();

        _query.Days.Add(Build.WorkedDay(
            "2026-03-02", Build.Template(1, location: place, amount: 100m)));

        DaysDto result = await Range();

        Assert.Equal(0m, result.tax);
        Assert.Equal(result.total_earned, result.net_earned);
    }

    [Fact]
    public async Task TaxIsTakenOffTheWage()
    {
        Location place = Place(tax: 20m);

        _query.Days.Add(Build.WorkedDay(
            "2026-03-02", Build.Template(1, location: place, amount: 100m)));

        DaysDto result = await Range();

        // 8 h * 100 = 800 gross, 20% of it withheld.
        Assert.Equal(800m, result.total_earned);
        Assert.Equal(160m, result.tax);
        Assert.Equal(640m, result.net_earned);
    }

    [Fact]
    public async Task TipsAreLeftOutOfTheTaxableBaseByDefault()
    {
        Location place = Place(tax: 20m);

        _query.Days.Add(Build.WorkedDay(
            "2026-03-02",
            Build.Template(1, location: place, amount: 100m),
            tips: 1000m));

        DaysDto result = await Range();

        Assert.Equal(1800m, result.total_earned);
        Assert.Equal(160m, result.tax);
    }

    [Fact]
    public async Task TipsAreTaxedWhereTheHouseSaysSo()
    {
        Location place = Place(tax: 20m, taxTips: true);

        _query.Days.Add(Build.WorkedDay(
            "2026-03-02",
            Build.Template(1, location: place, amount: 100m),
            tips: 1000m));

        DaysDto result = await Range();

        // (800 wage + 1000 tips) * 20%.
        Assert.Equal(360m, result.tax);
    }

    [Fact]
    public async Task WhatWasTippedOutIsNotTaxedAsIncome()
    {
        Location place = Place(tax: 20m, taxTips: true, tipOutOfTips: 10m);

        _query.Days.Add(Build.WorkedDay(
            "2026-03-02",
            Build.Template(1, location: place, amount: 100m),
            tips: 1000m));

        DaysDto result = await Range();

        // 100 handed on, so the taxable tips are 900: (800 + 900) * 20%.
        Assert.Equal(100m, result.tip_out);
        Assert.Equal(340m, result.tax);
    }

    [Fact]
    public async Task HolidayAccruesOnTheWageAndStaysOutOfTheTotals()
    {
        Location place = Place(holiday: 10m);

        _query.Days.Add(Build.WorkedDay(
            "2026-03-02",
            Build.Template(1, location: place, amount: 100m),
            tips: 500m));

        DaysDto result = await Range();

        // 10% of the 800 wage; the tips do not accrue holiday.
        Assert.Equal(80m, result.holiday_accrued);
        // Owed later, so it is nowhere in what was earned now.
        Assert.Equal(1300m, result.total_earned);
        Assert.Equal(1300m, result.net_earned);
    }

    [Fact]
    public async Task EachPlaceIsTaxedAtItsOwnRate()
    {
        Location bar = Build.Place(1, "Bar");
        Location cafe = Build.Place(2, "Cafe");

        bar.TaxPercent = 20m;
        cafe.TaxPercent = 0m;

        _query.Locations.Add(bar);
        _query.Locations.Add(cafe);

        _query.Days.Add(Build.WorkedDay(
            "2026-03-02", Build.Template(1, location: bar, amount: 100m)));
        _query.Days.Add(Build.WorkedDay(
            "2026-03-03", Build.Template(2, location: cafe, amount: 100m)));

        DaysDto result = await Range();

        Assert.Equal(1600m, result.total_earned);
        Assert.Equal(160m, result.tax);
    }

    [Fact]
    public async Task CurrenciesAreListedSoMixedTotalsCanBeCaught()
    {
        Location bar = Build.Place(1, "Bar");
        Location cafe = Build.Place(2, "Cafe");

        bar.Currency = "PLN";
        cafe.Currency = "EUR";

        _query.Locations.Add(bar);
        _query.Locations.Add(cafe);

        _query.Days.Add(Build.WorkedDay(
            "2026-03-02", Build.Template(1, location: bar, amount: 100m)));
        _query.Days.Add(Build.WorkedDay(
            "2026-03-03", Build.Template(2, location: cafe, amount: 100m)));

        DaysDto result = await Range();

        Assert.Equal(["EUR", "PLN"], result.currencies);
    }

    [Fact]
    public async Task OneCurrencyIsNotAMixture()
    {
        Location place = Place(currency: "PLN");

        _query.Days.Add(Build.WorkedDay(
            "2026-03-02", Build.Template(1, location: place, amount: 100m)));

        DaysDto result = await Range();

        Assert.Equal(["PLN"], result.currencies);
    }
}
