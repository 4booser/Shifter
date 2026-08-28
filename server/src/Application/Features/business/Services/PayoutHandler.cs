using Shifter.Application.Common.Exceptions;
using Shifter.Application.Features.business.DTOs;
using Shifter.Application.Features.business.Services.Interfaces;
using Shifter.Domain.Entities;
using Shifter.Infrastructure.Repositories.Interfaces;

namespace Shifter.Application.Features.business.Services;

public class PayoutHandler : IPayoutHandler
{
    private const int NoteMaxLength = 200;

    private readonly IShifterCommand _shifterCommand;
    private readonly IShifterQuery _shifterQuery;

    /// <summary>
    /// Optional: without it a payment is still recorded, it simply carries no
    /// rate. A payment that cannot be written down because a rate service is
    /// unavailable would be the worst of both worlds.
    /// </summary>
    private readonly Money.RateService? _rates;

    public PayoutHandler(
        IShifterCommand shifterCommand,
        IShifterQuery shifterQuery,
        Money.RateService? rates = null)
    {
        _shifterCommand = shifterCommand;
        _shifterQuery = shifterQuery;
        _rates = rates;
    }

    public async Task<PayoutDto[]> ListAsync(
        int userId,
        DateOnly from,
        DateOnly to,
        CancellationToken ct)
    {
        Payout[] payouts = await _shifterQuery.GetPayoutsAsync(userId, from, to, ct);

        return payouts.Select(ToDto).ToArray();
    }


    /// <summary>
    /// The three dates a payment cannot do without, and a floor under them.
    ///
    /// A missing one used to arrive as 0001-01-01 — the zero of the type, not
    /// an answer — and was stored. The payment then existed and did nothing:
    /// no period it covers contains any work, so no reconciliation ever
    /// matched it, and the list showed 01.01.0001 as though somebody had been
    /// paid in the first century.
    /// </summary>
    private static (DateOnly From, DateOnly To, DateOnly Received) Dates(PayoutCreateDto request)
    {
        // Nothing in this product happened before the millennium. The point is
        // not the exact year, it is that a date nobody could have meant is
        // refused rather than filed.
        var floor = new DateOnly(2000, 1, 1);

        var from = request.period_from
            ?? throw new ValidationException("A payment needs the period it covers.");
        var to = request.period_to
            ?? throw new ValidationException("A payment needs the period it covers.");
        var received = request.received_on
            ?? throw new ValidationException("A payment needs the day it arrived.");

        if (from < floor || to < floor || received < floor)
            throw new ValidationException("Those dates are not real ones.");

        return (from, to, received);
    }

    public async Task<PayoutDto> CreateAsync(
        PayoutCreateDto request,
        int userId,
        CancellationToken ct)
    {
        var (periodFrom, periodTo, receivedOn) = Dates(request);

        if (periodFrom > periodTo)
            throw new ValidationException("Period start must not be after its end.");

        if (request.amount < 0)
            throw new ValidationException("Amount cannot be negative.");

        if (request.note?.Length > NoteMaxLength)
            throw new ValidationException($"Note must be at most {NoteMaxLength} characters.");

        // A place that is not the caller's must not end up on their payment:
        // the reconciliation would then compare against work they never did.
        if (request.location_id is int placeId)
        {
            _ = await _shifterQuery.GetLocationAsync(userId, placeId, ct)
                ?? throw new NotFoundException("Place of work does not exist.");
        }

        // The place's currency at the time, and what it was worth on the day
        // the money arrived. Both stored, so that last August's wage stops
        // changing every morning with the exchange rate.
        var place = request.location_id is int id
            ? await _shifterQuery.GetLocationAsync(userId, id, ct)
            : null;

        var currency = place?.Currency ?? string.Empty;
        decimal? rate = null;
        DateOnly? rateOn = null;

        if (_rates is not null && currency.Length == 3
            && !string.Equals(currency, "UAH", StringComparison.OrdinalIgnoreCase))
        {
            var found = await _rates.OnAsync([currency], receivedOn, ct);

            if (found.TryGetValue(Money.NbuRateClient.Normalise(currency), out var pair))
            {
                rate = pair.Rate;
                rateOn = pair.On;
            }
        }

        Payout payout = new Payout()
        {
            UserId = userId,
            LocationId = request.location_id,
            PeriodFrom = periodFrom,
            PeriodTo = periodTo,
            Amount = request.amount,
            ReceivedOn = receivedOn,
            Note = string.IsNullOrWhiteSpace(request.note) ? null : request.note.Trim(),
            Stream = ParseStream(request.stream),
            Kind = ParseKind(request.kind),
            Currency = currency,
            RateToBase = rate,
            RateOn = rateOn,
        };

        if (! await _shifterCommand.AddPayoutAsync(payout, ct))
            throw new ForbiddenException("Can`t add payout.");

        // Re-read so the response carries the place's name; a freshly built
        // entity has only the id on it.
        return ToDto(await _shifterQuery.GetPayoutAsync(userId, payout.Id, ct) ?? payout);
    }

    public async Task DeleteAsync(int userId, int id, CancellationToken ct)
    {
        Payout payout = await _shifterQuery.GetPayoutAsync(userId, id, ct)
            ?? throw new NotFoundException("Payout does not exist.");

        // Deleted outright rather than archived: a payment recorded by mistake
        // has nothing worth keeping, unlike a template with history behind it.
        await _shifterCommand.DeletePayoutAsync(payout, ct);
    }

    private static PayoutDto ToDto(Payout payout) => new PayoutDto(
        payout.Id,
        payout.PeriodFrom,
        payout.PeriodTo,
        payout.Amount,
        payout.ReceivedOn,
        payout.Note,
        payout.LocationId,
        payout.Location?.Name,
        payout.Stream,
        payout.Kind,
        payout.Currency,
        payout.RateToBase,
        payout.RateOn
    );

    /// <summary>
    /// Anything unrecognised is read as covering everything, which is what a
    /// client that has never heard of the split will send.
    /// </summary>
    private static string ParseStream(string? value) => value?.ToLowerInvariant() switch
    {
        "wage" => "wage",
        "commission" => "commission",
        _ => "all"
    };

    /// <summary>
    /// Same rule as the stream: an older client sends nothing and means the
    /// payment that closes the period, which is what every payment was before
    /// the advance existed.
    /// </summary>
    private static string ParseKind(string? value) => value?.ToLowerInvariant() switch
    {
        "advance" => "advance",
        "bonus" => "bonus",
        "cash" => "cash",
        _ => "settlement"
    };
}
