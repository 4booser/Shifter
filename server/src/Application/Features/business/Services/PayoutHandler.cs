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

    public PayoutHandler(IShifterCommand shifterCommand, IShifterQuery shifterQuery)
    {
        _shifterCommand = shifterCommand;
        _shifterQuery = shifterQuery;
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

    public async Task<PayoutDto> CreateAsync(
        PayoutCreateDto request,
        int userId,
        CancellationToken ct)
    {
        if (request.period_from > request.period_to)
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

        Payout payout = new Payout()
        {
            UserId = userId,
            LocationId = request.location_id,
            PeriodFrom = request.period_from,
            PeriodTo = request.period_to,
            Amount = request.amount,
            ReceivedOn = request.received_on,
            Note = string.IsNullOrWhiteSpace(request.note) ? null : request.note.Trim(),
            Stream = ParseStream(request.stream)
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
        payout.Stream
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
}
