using Shifter.Application.Common.Exceptions;
using Shifter.Application.Features.business.DTOs;
using Shifter.Application.Features.business.Services;

using Xunit;

namespace Shifter.Tests;

/// <summary>
/// A payment has to have happened on a day. DateOnly has no null, so a client
/// that left the field out sent the type's zero and the server filed a
/// payment received on the first of January in the year one — a payment that
/// exists, shows up in the list as 01.01.0001, and matches no period any work
/// was done in, so no reconciliation ever finds it.
/// </summary>
public class PayoutDateTests
{
    private static PayoutHandler Made(out FakeShifterQuery query)
    {
        query = new FakeShifterQuery();

        return new PayoutHandler(new FakeShifterCommand(query), query);
    }

    private static PayoutCreateDto Payment(
        DateOnly? from = null,
        DateOnly? to = null,
        DateOnly? received = null)
        => new(
            from ?? new DateOnly(2026, 8, 1),
            to ?? new DateOnly(2026, 8, 15),
            18_500m,
            received ?? new DateOnly(2026, 8, 20),
            note: "Аванс",
            location_id: null);

    [Fact]
    public async Task A_payment_that_says_when_it_arrived_is_recorded()
    {
        var handler = Made(out _);

        var saved = await handler.CreateAsync(Payment(), Build.UserId, CancellationToken.None);

        Assert.Equal(18_500m, saved.amount);
        Assert.Equal(new DateOnly(2026, 8, 20), saved.received_on);
    }

    [Fact]
    public async Task A_payment_with_no_day_on_it_is_refused_rather_than_dated_year_one()
    {
        var handler = Made(out _);

        var refused = await Assert.ThrowsAsync<ValidationException>(() =>
            handler.CreateAsync(
                new PayoutCreateDto(new DateOnly(2026, 8, 1), new DateOnly(2026, 8, 15), 18_500m, null, null, null),
                Build.UserId, CancellationToken.None));

        Assert.Contains("day it arrived", refused.Message);
    }

    [Fact]
    public async Task A_payment_with_no_period_is_refused_too()
    {
        var handler = Made(out _);

        await Assert.ThrowsAsync<ValidationException>(() =>
            handler.CreateAsync(
                new PayoutCreateDto(null, null, 18_500m, new DateOnly(2026, 8, 20), null, null),
                Build.UserId, CancellationToken.None));
    }

    [Fact]
    public async Task A_date_nobody_could_have_meant_is_refused_even_when_sent_on_purpose()
    {
        // The zero, spelled out. A client that serialises default(DateOnly)
        // sends exactly this, and it used to be filed as a real payment.
        var handler = Made(out _);

        await Assert.ThrowsAsync<ValidationException>(() =>
            handler.CreateAsync(
                Payment(from: new DateOnly(1, 1, 1), to: new DateOnly(1, 1, 1), received: new DateOnly(1, 1, 1)),
                Build.UserId, CancellationToken.None));
    }
}
