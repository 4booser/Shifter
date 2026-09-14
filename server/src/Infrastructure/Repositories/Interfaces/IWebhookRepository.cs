using Shifter.Domain.Entities;

namespace Shifter.Infrastructure.Repositories.Interfaces;

public interface IWebhookRepository
{
    Task<WebhookEndpoint[]> GetForUserAsync(int userId, CancellationToken ct);

    /// <summary>Owner-scoped, tracked, for editing.</summary>
    Task<WebhookEndpoint?> GetAsync(int userId, int id, CancellationToken ct);

    /// <summary>The endpoint an incoming request claims to be.</summary>
    Task<WebhookEndpoint?> GetByTokenAsync(string token, CancellationToken ct);

    Task<bool> TokenExistsAsync(string token, CancellationToken ct);

    Task AddAsync(WebhookEndpoint endpoint, CancellationToken ct);
    Task RemoveAsync(WebhookEndpoint endpoint, CancellationToken ct);
    Task SaveAsync(CancellationToken ct);

    /// <summary>Newest first, capped: the log is for the last few days, not for ever.</summary>
    Task<WebhookDelivery[]> GetDeliveriesAsync(int endpointId, int take, CancellationToken ct);

    /// <summary>One stored delivery of the caller's own, for replaying it.</summary>
    Task<WebhookDelivery?> GetDeliveryAsync(int userId, int deliveryId, CancellationToken ct);

    /// <summary>Whether this endpoint already saw the sender's id.</summary>
    Task<bool> DeliveryExistsAsync(int endpointId, string externalId, CancellationToken ct);

    /// <summary>Records the arrival and trims the endpoint's log back to its cap.</summary>
    Task AddDeliveryAsync(WebhookDelivery delivery, CancellationToken ct);

    /// <summary>How the recent arrivals went, for every endpoint at once.</summary>
    Task<DeliveryTally[]> TallyAsync(int[] endpointIds, DateTime since, CancellationToken ct);
}

/// <summary>Recent arrivals at one endpoint.</summary>
public sealed record DeliveryTally(int EndpointId, int Applied, int Failed);
