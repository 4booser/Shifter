using Shifter.Application.Features.business.DTOs;
using Shifter.Application.Features.business.Services;
using Shifter.Domain.Entities;

using Xunit;

namespace Shifter.Tests;

/// <summary>
/// A payment of 18 500 złoty in August is a fact. What it was worth is also a
/// fact, and re-deriving it every time somebody opens the page means last
/// August's wage changes every morning with the exchange rate.
///
/// So the rate is written down beside the money, once, at the moment the
/// payment is recorded — and nothing afterwards moves it.
/// </summary>
public class PayoutRateTests
{
    private static readonly DateOnly Received = new(2026, 8, 10);

    private static PayoutCreateDto Payment(int? place) => new(
        new DateOnly(2026, 7, 16),
        new DateOnly(2026, 7, 31),
        18_500m,
        Received,
        note: null,
        location_id: place);

    private static (PayoutHandler Handler, FakeShifterQuery Query) Made()
    {
        var query = new FakeShifterQuery();

        return (new PayoutHandler(new FakeShifterCommand(query), query), query);
    }

    [Fact]
    public async Task A_payment_in_the_apps_own_currency_carries_no_rate()
    {
        // Nothing to convert, and a rate of one written down as though it had
        // been looked up would be a lie about where the number came from.
        var (handler, query) = Made();

        query.Locations.Add(Build.Place(1));

        var saved = await handler.CreateAsync(Payment(1), Build.UserId, CancellationToken.None);

        Assert.Null(saved.rate_to_base);
        Assert.Null(saved.rate_on);
    }

    [Fact]
    public async Task A_payment_with_no_place_on_it_carries_no_currency()
    {
        var (handler, _) = Made();

        var saved = await handler.CreateAsync(Payment(null), Build.UserId, CancellationToken.None);

        Assert.Equal(string.Empty, saved.currency);
    }

    [Fact]
    public async Task The_currency_of_the_place_is_written_onto_the_payment()
    {
        var (handler, query) = Made();
        var place = Build.Place(1);

        place.Currency = "PLN";
        query.Locations.Add(place);

        var saved = await handler.CreateAsync(Payment(1), Build.UserId, CancellationToken.None);

        // The rate needs a rate service, which this handler is built without;
        // the currency is recorded either way, so nothing is lost by a
        // service being unavailable when somebody writes a payment down.
        Assert.Equal("PLN", saved.currency);
        Assert.Null(saved.rate_to_base);
    }

    [Fact]
    public async Task A_payment_already_recorded_keeps_the_rate_it_was_recorded_with()
    {
        // The whole point. Re-reading is not re-deriving.
        var (handler, query) = Made();
        var place = Build.Place(1);

        place.Currency = "PLN";
        query.Locations.Add(place);

        query.Payouts.Add(new Payout
        {
            Id = 1,
            UserId = Build.UserId,
            LocationId = 1,
            PeriodFrom = new DateOnly(2026, 7, 16),
            PeriodTo = new DateOnly(2026, 7, 31),
            Amount = 18_500m,
            ReceivedOn = Received,
            Currency = "PLN",
            RateToBase = 10.42m,
            RateOn = new DateOnly(2026, 8, 8),
        });

        // Payments are listed by the period they settle, not by the day the
        // money moved.
        var rows = await handler.ListAsync(
            Build.UserId, new DateOnly(2026, 7, 1), new DateOnly(2026, 7, 31), CancellationToken.None);

        var only = Assert.Single(rows);

        Assert.Equal(10.42m, only.rate_to_base);
        // The eighth, not the tenth: nothing is published at a weekend, and
        // the last rate that existed is the honest answer.
        Assert.Equal(new DateOnly(2026, 8, 8), only.rate_on);
    }
}
