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

    private void Received(
        Location? place, string from, string to, decimal amount, string kind = "settlement")
    {
        _query.Payouts.Add(new Payout
        {
            UserId = Build.UserId,
            LocationId = place?.Id,
            PeriodFrom = DateOnly.Parse(from),
            PeriodTo = DateOnly.Parse(to),
            Amount = amount,
            ReceivedOn = DateOnly.Parse(to),
            Kind = kind,
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
        DateOnly today = DateOnly.FromDateTime(DateTime.UtcNow);

        // Payday deliberately after today, so the period around today is
        // unambiguously still running. Pinned at 1, this test asserted the
        // right thing on 364 days a year and the wrong thing on the first of
        // the month: there the period that ended yesterday really is due, and
        // saying so is the handler doing its job.
        Location place = Monthly();

        place.PayDay = today.Day == 28 ? 1 : today.Day + 1;

        Worked(place, today.ToString("yyyy-MM-dd"));

        ReconciliationDto result = await Reconcile(
            today.ToString("yyyy-MM-01"), today.ToString("yyyy-MM-dd"));

        Assert.Equal("open", Assert.Single(result.periods).status);
        Assert.Equal(0m, result.awaited);
    }

    // ==== Drawing a line under a shortfall ====

    private void Close(Location place, string periodFrom, string kind = "written-off")
        => _query.Settlements.Add(new PeriodSettlement
        {
            UserId = Build.UserId,
            LocationId = place.Id,
            PeriodFrom = DateOnly.Parse(periodFrom),
            Stream = "all",
            Kind = kind,
        });

    /// <summary>Two short months at one place: the shape a shortfall needs.</summary>
    private Location TwoShortMonths()
    {
        Location place = Monthly();

        foreach (var date in new[] { "2026-01-10", "2026-01-20", "2026-02-10", "2026-02-20" })
            Worked(place, date, rate: 100m);

        Received(place, "2026-01-01", "2026-01-31", 500m);
        Received(place, "2026-02-01", "2026-02-28", 500m);

        return place;
    }

    [Fact]
    public async Task TwoShortMonthsAreAPattern()
    {
        TwoShortMonths();

        ReconciliationDto result = await Reconcile("2026-01-01", "2026-03-31");

        Assert.Single(result.shortfalls);
        Assert.Equal(2, result.shortfalls[0].periods);
    }

    [Fact]
    public async Task AClosedMonthBreaksTheRun()
    {
        Location place = TwoShortMonths();

        // The line under February leaves one short month, which is a rounding
        // argument rather than a pattern.
        Close(place, "2026-02-01");

        ReconciliationDto result = await Reconcile("2026-01-01", "2026-03-31");

        Assert.Empty(result.shortfalls);
    }

    [Fact]
    public async Task TheArithmeticIsNotTouchedByTheLine()
    {
        Location place = TwoShortMonths();

        Close(place, "2026-02-01");

        ReconciliationDto result = await Reconcile("2026-01-01", "2026-03-31");
        PayPeriodDto february = result.periods.Single(row => row.period_from.Month == 2);

        // Still short, still says how short — it just stopped being chased.
        Assert.Equal("short", february.status);
        Assert.Equal("written-off", february.settled);
        Assert.True(february.difference < 0);
    }

    [Fact]
    public async Task AClosedPeriodStopsCountingAsOwed()
    {
        Location place = Monthly();

        Worked(place, "2026-01-10", rate: 100m);
        Close(place, "2026-01-01");

        ReconciliationDto result = await Reconcile("2026-01-01", "2026-03-31");

        Assert.Equal(0m, result.awaited);
        Assert.Equal(0m, result.overdue);
    }

    [Fact]
    public async Task AnUnclosedPeriodStillCountsAsOwed()
    {
        Location place = Monthly();

        Worked(place, "2026-01-10", rate: 100m);

        ReconciliationDto result = await Reconcile("2026-01-01", "2026-03-31");

        Assert.True(result.awaited > 0m);
    }

    // ==== Paid twice a month ====

    [Fact]
    public async Task AnAdvanceOnItsOwnIsNotAShortfall()
    {
        // Half the trade pays аванс then расчёт. On the day the month closes the
        // advance is all that has arrived, and calling that "they paid you
        // short" every month is how the word stops meaning anything.
        Location place = Monthly();

        Worked(place, "2020-01-06");
        Received(place, "2020-01-01", "2020-01-31", 300m, kind: "advance");

        ReconciliationDto result = await Reconcile("2020-01-01", "2020-01-31");

        PayPeriodDto period = Assert.Single(result.periods);

        Assert.Equal("partial", period.status);
        Assert.Equal(300m, period.paid_advance);
        Assert.Equal(500m, result.awaited);
        Assert.Empty(result.shortfalls);
    }

    [Fact]
    public async Task AnAdvanceFollowedByTheSettlementClearsThePeriod()
    {
        Location place = Monthly();

        Worked(place, "2020-01-06");
        Received(place, "2020-01-01", "2020-01-31", 300m, kind: "advance");
        Received(place, "2020-01-01", "2020-01-31", 500m);

        ReconciliationDto result = await Reconcile("2020-01-01", "2020-01-31");

        PayPeriodDto period = Assert.Single(result.periods);

        Assert.Equal("paid", period.status);
        Assert.Equal(800m, period.paid);
        Assert.Equal(300m, period.paid_advance);
        Assert.Equal(0m, result.awaited);
    }

    [Fact]
    public async Task ASettlementThatArrivesShortIsStillAShortfall()
    {
        // The advance excuses an unfinished month, not an underpaid one: once
        // the closing payment lands, the arithmetic speaks again.
        Location place = Monthly();

        Worked(place, "2020-01-06");
        Received(place, "2020-01-01", "2020-01-31", 300m, kind: "advance");
        Received(place, "2020-01-01", "2020-01-31", 200m);

        ReconciliationDto result = await Reconcile("2020-01-01", "2020-01-31");

        Assert.Equal("short", Assert.Single(result.periods).status);
    }

    [Fact]
    public async Task AHalfPaidMonthDoesNotHideTheMonthsShortBehindIt()
    {
        // The run is read newest first and stops at the first period that came
        // out right. A half-paid current month is neither right nor wrong yet,
        // so it must step aside instead of breaking the run — otherwise every
        // pattern disappears for as long as somebody is owed a settlement.
        Location place = Monthly();

        Worked(place, "2020-01-06");
        Received(place, "2020-01-01", "2020-01-31", 700m);

        Worked(place, "2020-02-06");
        Received(place, "2020-02-01", "2020-02-29", 700m);

        Worked(place, "2020-03-06");
        Received(place, "2020-03-01", "2020-03-31", 300m, kind: "advance");

        ReconciliationDto result = await Reconcile("2020-01-01", "2020-03-31");

        ShortfallDto pattern = Assert.Single(result.shortfalls);

        Assert.Equal(2, pattern.periods);
        Assert.Equal(200m, pattern.total_short);
    }
}
