using Shifter.Application.Features.business.DTOs;
using Shifter.Application.Features.business.Services;
using Shifter.Domain.Entities;

using Xunit;

namespace Shifter.Tests;

/// <summary>
/// The payout calendar and the underpayment detector. Both answer questions
/// people cannot answer by eye once two places pay on different cycles.
/// </summary>
public class ReconciliationTests
{
    private readonly FakeShifterQuery _query = new();
    private readonly ReconciliationHandler _handler;

    public ReconciliationTests()
    {
        _handler = new ReconciliationHandler(_query);
    }

    private Task<ReconciliationDto> Reconcile(string from, string to)
        => _handler.BuildAsync(
            Build.UserId, DateOnly.Parse(from), DateOnly.Parse(to), CancellationToken.None);

    private Location Monthly(int id = 1, string name = "Bar", decimal tax = 0m)
    {
        Location place = Build.Place(id, name);

        place.PayPeriod = PayPeriod.Monthly;
        place.PayDay = 1;
        place.TaxPercent = tax;

        _query.Locations.Add(place);

        return place;
    }

    private void Worked(Location place, string date, decimal rate = 100m)
    {
        _query.Days.Add(Build.WorkedDay(
            date, Build.Template(place.Id, location: place, amount: rate)));
    }

    private void Received(Location? place, string from, string to, decimal amount)
    {
        _query.Payouts.Add(new Payout
        {
            UserId = Build.UserId,
            LocationId = place?.Id,
            PeriodFrom = DateOnly.Parse(from),
            PeriodTo = DateOnly.Parse(to),
            Amount = amount,
            ReceivedOn = DateOnly.Parse(to),
        });
    }

    [Fact]
    public async Task APeriodWithNoWorkIsNotAnUnpaidPeriod()
    {
        Monthly();

        ReconciliationDto result = await Reconcile("2020-01-01", "2020-03-31");

        Assert.Empty(result.periods);
    }

    [Fact]
    public async Task AFinishedPeriodWithNothingPaidIsOverdue()
    {
        Location place = Monthly();

        Worked(place, "2020-01-06");

        ReconciliationDto result = await Reconcile("2020-01-01", "2020-01-31");

        PayPeriodDto period = Assert.Single(result.periods);

        Assert.Equal("overdue", period.status);
        Assert.Equal(800m, period.expected);
        Assert.Equal(0m, period.paid);
        Assert.True(period.days_late > 0);
        Assert.Equal(800m, result.overdue);
    }

    [Fact]
    public async Task APaymentThatMatchesClearsThePeriod()
    {
        Location place = Monthly();

        Worked(place, "2020-01-06");
        Received(place, "2020-01-01", "2020-01-31", 800m);

        ReconciliationDto result = await Reconcile("2020-01-01", "2020-01-31");

        PayPeriodDto period = Assert.Single(result.periods);

        Assert.Equal("paid", period.status);
        Assert.Equal(0m, period.difference);
        Assert.Equal(0m, result.overdue);
    }

    [Fact]
    public async Task ASmallDifferenceIsRoundingRatherThanAShortfall()
    {
        Location place = Monthly();

        Worked(place, "2020-01-06");
        Received(place, "2020-01-01", "2020-01-31", 799.5m);

        ReconciliationDto result = await Reconcile("2020-01-01", "2020-01-31");

        Assert.Equal("paid", Assert.Single(result.periods).status);
        Assert.Empty(result.shortfalls);
    }

    [Fact]
    public async Task APaymentThatFallsShortIsFlagged()
    {
        Location place = Monthly();

        Worked(place, "2020-01-06");
        Received(place, "2020-01-01", "2020-01-31", 600m);

        ReconciliationDto result = await Reconcile("2020-01-01", "2020-01-31");

        PayPeriodDto period = Assert.Single(result.periods);

        Assert.Equal("short", period.status);
        Assert.Equal(-200m, period.difference);
    }

    [Fact]
    public async Task PayingMoreThanCalculatedIsReportedToo()
    {
        Location place = Monthly();

        Worked(place, "2020-01-06");
        Received(place, "2020-01-01", "2020-01-31", 1000m);

        ReconciliationDto result = await Reconcile("2020-01-01", "2020-01-31");

        Assert.Equal("over", Assert.Single(result.periods).status);
    }

    [Fact]
    public async Task TaxIsTakenOffBeforeComparingWithWhatArrived()
    {
        Location place = Monthly(tax: 20m);

        Worked(place, "2020-01-06");
        Received(place, "2020-01-01", "2020-01-31", 640m);

        ReconciliationDto result = await Reconcile("2020-01-01", "2020-01-31");

        PayPeriodDto period = Assert.Single(result.periods);

        // 800 gross, 160 withheld: 640 is the full payment, not a shortfall.
        Assert.Equal(640m, period.expected);
        Assert.Equal("paid", period.status);
    }

    /// <summary>One short month is an argument. Three is a pattern.</summary>
    [Fact]
    public async Task ARunOfShortMonthsAtOnePlaceIsRaised()
    {
        Location place = Monthly();

        foreach (string month in new[] { "01", "02", "03" })
        {
            Worked(place, $"2020-{month}-06");
            Received(place, $"2020-{month}-01", $"2020-{month}-28", 600m);
        }

        ReconciliationDto result = await Reconcile("2020-01-01", "2020-03-31");

        ShortfallDto shortfall = Assert.Single(result.shortfalls);

        Assert.Equal(3, shortfall.periods);
        // Positive: the amount owed, not the direction it went.
        Assert.Equal(600m, shortfall.total_short);
        Assert.Equal(new DateOnly(2020, 1, 1), shortfall.since);
    }

    [Fact]
    public async Task OneShortMonthAloneIsNotAPattern()
    {
        Location place = Monthly();

        Worked(place, "2020-01-06");
        Received(place, "2020-01-01", "2020-01-31", 600m);

        Worked(place, "2020-02-06");
        Received(place, "2020-02-01", "2020-02-29", 800m);

        ReconciliationDto result = await Reconcile("2020-01-01", "2020-02-29");

        // February settled in full, so the run is broken.
        Assert.Empty(result.shortfalls);
    }

    [Fact]
    public async Task EachPlaceIsReconciledOnItsOwnCycle()
    {
        Location bar = Monthly(1, "Bar");
        Location cafe = Build.Place(2, "Cafe");

        cafe.PayPeriod = PayPeriod.Weekly;
        cafe.PayAnchor = new DateOnly(2020, 1, 6);
        _query.Locations.Add(cafe);

        Worked(bar, "2020-01-08");

        _query.Days.Add(Build.WorkedDay(
            "2020-01-09", Build.Template(2, location: cafe, amount: 100m)));

        ReconciliationDto result = await Reconcile("2020-01-01", "2020-01-31");

        Assert.Contains(result.periods, row => row.location_name == "Bar");

        PayPeriodDto week = result.periods.First(row => row.location_name == "Cafe");

        // The weekly cycle anchored on the 6th covers the 6th to the 12th.
        Assert.Equal(new DateOnly(2020, 1, 6), week.period_from);
        Assert.Equal(new DateOnly(2020, 1, 12), week.period_to);
    }

    [Fact]
    public async Task APaymentWithNoPlaceOnItIsNotCreditedToOne()
    {
        Location place = Monthly();

        Worked(place, "2020-01-06");
        Received(null, "2020-01-01", "2020-01-31", 800m);

        ReconciliationDto result = await Reconcile("2020-01-01", "2020-01-31");

        // Recorded, but it cannot settle a place it was never attributed to.
        Assert.Equal(0m, Assert.Single(result.periods).paid);
    }

    [Fact]
    public async Task APeriodStillBeingWorkedIsNotChased()
    {
        Location place = Monthly();
        DateOnly today = DateOnly.FromDateTime(DateTime.UtcNow);

        Worked(place, today.ToString("yyyy-MM-dd"));

        ReconciliationDto result = await Reconcile(
            today.ToString("yyyy-MM-01"), today.ToString("yyyy-MM-dd"));

        Assert.Equal("open", Assert.Single(result.periods).status);
        Assert.Equal(0m, result.awaited);
    }
}
