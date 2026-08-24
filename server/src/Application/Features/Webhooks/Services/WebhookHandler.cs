using Shifter.Application.Common.Exceptions;
using Shifter.Application.Features.Webhooks.DTOs;
using Shifter.Application.Features.Webhooks.Services.Interfaces;
using Shifter.Domain.Entities;
using Shifter.Infrastructure.Repositories.Interfaces;

namespace Shifter.Application.Features.Webhooks.Services;

/// <summary>
/// The manager. Everything here is the owner acting on their own endpoints:
/// making one, correcting its mapping, reading what arrived and running it
/// again once the mapping is right.
/// </summary>
public class WebhookHandler : IWebhookHandler
{
    private const int NameMaxLength = 60;

    /// <summary>Long enough for a real provider's mapping, short enough that
    /// nobody is storing a payload in the field by mistake.</summary>
    private const int MappingMaxLength = 4_000;

    private const int HeaderMaxLength = 120;
    private const int SecretMaxLength = 200;

    /// <summary>How much of the log the screen shows.</summary>
    private const int DeliveryPage = 50;

    /// <summary>The stretch the health counters cover.</summary>
    private static readonly TimeSpan RecentWindow = TimeSpan.FromDays(7);

    private readonly IWebhookRepository _webhooks;
    private readonly IShifterQuery _shifterQuery;
    private readonly IWebhookIngestHandler _ingest;

    public WebhookHandler(
        IWebhookRepository webhooks,
        IShifterQuery shifterQuery,
        IWebhookIngestHandler ingest)
    {
        _webhooks = webhooks;
        _shifterQuery = shifterQuery;
        _ingest = ingest;
    }

    public async Task<WebhookDto[]> ListAsync(int userId, CancellationToken ct)
    {
        WebhookEndpoint[] endpoints = await _webhooks.GetForUserAsync(userId, ct);

        if (endpoints.Length == 0) return [];

        DeliveryTally[] tallies = await _webhooks.TallyAsync(
            endpoints.Select(endpoint => endpoint.Id).ToArray(),
            DateTime.UtcNow - RecentWindow,
            ct);

        Dictionary<int, DeliveryTally> byEndpoint =
            tallies.ToDictionary(tally => tally.EndpointId);

        return endpoints
            .Select(endpoint => ToDto(
                endpoint,
                byEndpoint.GetValueOrDefault(endpoint.Id)))
            .ToArray();
    }

    public async Task<WebhookDto> CreateAsync(
        WebhookSaveDto request,
        int userId,
        CancellationToken ct)
    {
        WebhookEndpoint endpoint = new WebhookEndpoint
        {
            UserId = userId,
            Name = string.Empty,
            Token = await NewTokenAsync(ct),
            Secret = WebhookSignature.NewSecret(),
            CreatedAt = DateTime.UtcNow
        };

        await ApplyAsync(request, endpoint, userId, ct);

        await _webhooks.AddAsync(endpoint, ct);

        return ToDto(endpoint, null);
    }

    public async Task<WebhookDto> UpdateAsync(
        WebhookSaveDto request,
        int userId,
        int id,
        CancellationToken ct)
    {
        WebhookEndpoint endpoint = await RequireAsync(userId, id, ct);

        await ApplyAsync(request, endpoint, userId, ct);

        await _webhooks.SaveAsync(ct);

        return ToDto(endpoint, null);
    }

    public async Task<WebhookDto> RotateAsync(int userId, int id, CancellationToken ct)
    {
        WebhookEndpoint endpoint = await RequireAsync(userId, id, ct);

        endpoint.Rotate(await NewTokenAsync(ct), WebhookSignature.NewSecret());

        await _webhooks.SaveAsync(ct);

        return ToDto(endpoint, null);
    }

    public async Task DeleteAsync(int userId, int id, CancellationToken ct)
    {
        WebhookEndpoint endpoint = await RequireAsync(userId, id, ct);

        // The log goes with it, by cascade. Nothing the endpoint wrote is
        // touched: those days belong to the calendar now, not to the sender.
        await _webhooks.RemoveAsync(endpoint, ct);
    }

    public async Task<DeliveryDto[]> DeliveriesAsync(int userId, int id, CancellationToken ct)
    {
        WebhookEndpoint endpoint = await RequireAsync(userId, id, ct);

        WebhookDelivery[] deliveries =
            await _webhooks.GetDeliveriesAsync(endpoint.Id, DeliveryPage, ct);

        return deliveries.Select(ToDto).ToArray();
    }

    public async Task<IngestResultDto> ReplayAsync(
        int userId,
        int deliveryId,
        CancellationToken ct)
    {
        WebhookDelivery delivery = await _webhooks.GetDeliveryAsync(userId, deliveryId, ct)
            ?? throw new NotFoundException("No such delivery.");

        // A body cut down to fit the log would be replayed as broken JSON, and
        // saying so beats writing half a day's takings.
        if (delivery.Payload.EndsWith('…'))
        {
            throw new ConflictException(
                "This delivery was too large to keep in full and cannot be replayed.");
        }

        // Re-read tracked: the replay stamps the endpoint and adds to its log,
        // and the copy hanging off the delivery came back read-only.
        WebhookEndpoint endpoint = await RequireAsync(userId, delivery.EndpointId, ct);

        return await _ingest.RunAsync(endpoint, delivery.Payload, IngestOptions.Replay, ct);
    }

    public async Task<IngestResultDto> TestAsync(
        int userId,
        int id,
        string body,
        bool apply,
        CancellationToken ct)
    {
        WebhookEndpoint endpoint = await RequireAsync(userId, id, ct);

        if (string.IsNullOrWhiteSpace(body))
            throw new ValidationException("Paste a payload to try.");

        return await _ingest.RunAsync(
            endpoint,
            body,
            apply ? IngestOptions.Replay : IngestOptions.DryRun,
            ct);
    }

    private static string? Trimmed(string? value)
        => string.IsNullOrWhiteSpace(value) ? null : value.Trim();

    private async Task<WebhookEndpoint> RequireAsync(int userId, int id, CancellationToken ct)
        => await _webhooks.GetAsync(userId, id, ct)
            ?? throw new NotFoundException("No such webhook endpoint.");

    private async Task ApplyAsync(
        WebhookSaveDto request,
        WebhookEndpoint endpoint,
        int userId,
        CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(request.name))
            throw new ValidationException("Name is empty.");

        if (request.name.Trim().Length > NameMaxLength)
            throw new ValidationException($"Name must be at most {NameMaxLength} characters.");

        if (request.mapping?.Length > MappingMaxLength)
            throw new ValidationException($"The mapping must be at most {MappingMaxLength} characters.");

        // Half a credential can never verify anything, and an endpoint that
        // silently ignored the half it was given would look configured while
        // refusing every delivery.
        if (string.IsNullOrWhiteSpace(request.signature_header)
            != string.IsNullOrWhiteSpace(request.signature_secret))
        {
            throw new ValidationException(
                "A sender's signature needs both the header it signs under and "
                + "the key it signs with, or neither.");
        }

        if (request.signature_header?.Length > HeaderMaxLength
            || request.signature_secret?.Length > SecretMaxLength)
        {
            throw new ValidationException("That signature header or key is too long.");
        }

        // Parsed here so a mapping that cannot be read is refused while someone
        // is looking at it, rather than at three in the morning when the till
        // closes and the delivery is the only thing left to blame.
        PayloadMapping.Parse(request.mapping);

        WebhookKind kind = ParseKind(request.kind);

        if (request.default_shift_id is int shiftId)
        {
            _ = await _shifterQuery.GetShiftAsync(userId, shiftId, ct)
                ?? throw new NotFoundException("Shift template does not exist.");
        }

        endpoint.Name = request.name.Trim();
        endpoint.Kind = kind;
        endpoint.Active = request.active;
        endpoint.DefaultShiftId = request.default_shift_id;
        endpoint.Mapping = string.IsNullOrWhiteSpace(request.mapping)
            ? null
            : request.mapping.Trim();

        endpoint.SignatureHeader = Trimmed(request.signature_header);
        endpoint.SignatureSecret = Trimmed(request.signature_secret);

        // The navigation is stale the moment the id changes, and the response
        // is built from it. Cleared rather than re-read: the name is only there
        // to be shown, and the next list call fetches it properly.
        if (endpoint.DefaultShift?.Id != request.default_shift_id) endpoint.DefaultShift = null;
    }

    /// <summary>
    /// A token nobody else holds. Collisions are vanishingly unlikely at 24
    /// random bytes, but the address is the whole of an incoming request's
    /// identity, so the one case worth ruling out is ruled out.
    /// </summary>
    private async Task<string> NewTokenAsync(CancellationToken ct)
    {
        for (int attempt = 0; attempt < 5; attempt += 1)
        {
            string token = WebhookSignature.NewToken();

            if (!await _webhooks.TokenExistsAsync(token, ct)) return token;
        }

        throw new ConflictException("Could not allocate an address. Try again.");
    }

    /// <summary>
    /// Strict, unlike the payout stream's lenient parse: the kind decides which
    /// half of the calendar an endpoint can write to, and a typo quietly read as
    /// "sales" would point a timesheet at the takings.
    /// </summary>
    private static WebhookKind ParseKind(string? value) => value?.Trim().ToLowerInvariant() switch
    {
        "sales" => WebhookKind.Sales,
        "hours" => WebhookKind.Hours,
        _ => throw new ValidationException("Kind must be either sales or hours.")
    };

    internal static string KindName(WebhookKind kind) => kind switch
    {
        WebhookKind.Hours => "hours",
        _ => "sales"
    };

    private static WebhookDto ToDto(WebhookEndpoint endpoint, DeliveryTally? tally) =>
        new WebhookDto(
            endpoint.Id,
            endpoint.Name,
            KindName(endpoint.Kind),
            $"/{WebhookRoutes.Hooks}/{endpoint.Token}",
            endpoint.Token,
            endpoint.Secret,
            endpoint.Active,
            endpoint.DefaultShiftId,
            endpoint.DefaultShift?.Name,
            endpoint.Mapping,
            endpoint.SignatureHeader,
            endpoint.SignatureSecret,
            endpoint.CreatedAt,
            endpoint.LastDeliveryAt,
            tally?.Applied ?? 0,
            tally?.Failed ?? 0);

    private static DeliveryDto ToDto(WebhookDelivery delivery) => new DeliveryDto(
        delivery.Id,
        delivery.ReceivedAt,
        delivery.Status switch
        {
            DeliveryStatus.Applied => "applied",
            DeliveryStatus.Duplicate => "duplicate",
            DeliveryStatus.Rejected => "rejected",
            DeliveryStatus.Empty => "empty",
            _ => "failed"
        },
        delivery.ExternalId,
        delivery.AppliedDate,
        delivery.Error,
        delivery.Payload);
}
