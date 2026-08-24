using Shifter.Domain.Entities;
using Shifter.Infrastructure.Repositories.Interfaces;

namespace Shifter.Tests;

/// <summary>
/// In-memory endpoints and their log. Hand-written like the other fakes: the
/// receiving side asks it three questions, and a plain list answers all three
/// without pretending to be a database.
/// </summary>
public sealed class FakeWebhookRepository : IWebhookRepository
{
    public List<WebhookEndpoint> Endpoints { get; } = [];
    public List<WebhookDelivery> Deliveries { get; } = [];

    public Task<WebhookEndpoint[]> GetForUserAsync(int userId, CancellationToken ct)
        => Task.FromResult(Endpoints.Where(hook => hook.UserId == userId).ToArray());

    public Task<WebhookEndpoint?> GetAsync(int userId, int id, CancellationToken ct)
        => Task.FromResult(Endpoints.FirstOrDefault(hook => hook.UserId == userId && hook.Id == id));

    public Task<WebhookEndpoint?> GetByTokenAsync(string token, CancellationToken ct)
        => Task.FromResult(Endpoints.FirstOrDefault(hook => hook.Token == token));

    public Task<bool> TokenExistsAsync(string token, CancellationToken ct)
        => Task.FromResult(Endpoints.Any(hook => hook.Token == token));

    public Task AddAsync(WebhookEndpoint endpoint, CancellationToken ct)
    {
        endpoint.Id = endpoint.Id == 0 ? Endpoints.Count + 1 : endpoint.Id;
        Endpoints.Add(endpoint);

        return Task.CompletedTask;
    }

    public Task RemoveAsync(WebhookEndpoint endpoint, CancellationToken ct)
    {
        Endpoints.Remove(endpoint);

        return Task.CompletedTask;
    }

    public Task SaveAsync(CancellationToken ct) => Task.CompletedTask;

    public Task<WebhookDelivery[]> GetDeliveriesAsync(int endpointId, int take, CancellationToken ct)
        => Task.FromResult(Deliveries
            .Where(delivery => delivery.EndpointId == endpointId)
            .OrderByDescending(delivery => delivery.ReceivedAt)
            .Take(take)
            .ToArray());

    public Task<WebhookDelivery?> GetDeliveryAsync(int userId, int deliveryId, CancellationToken ct)
        => Task.FromResult(Deliveries.FirstOrDefault(delivery =>
            delivery.Id == deliveryId
            && Endpoints.Any(hook => hook.Id == delivery.EndpointId && hook.UserId == userId)));

    public Task<bool> DeliveryExistsAsync(int endpointId, string externalId, CancellationToken ct)
        => Task.FromResult(Deliveries.Any(delivery =>
            delivery.EndpointId == endpointId && delivery.ExternalId == externalId));

    public Task AddDeliveryAsync(WebhookDelivery delivery, CancellationToken ct)
    {
        delivery.Id = Deliveries.Count + 1;
        Deliveries.Add(delivery);

        return Task.CompletedTask;
    }

    public Task<DeliveryTally[]> TallyAsync(int[] endpointIds, DateTime since, CancellationToken ct)
        => Task.FromResult(Deliveries
            .Where(delivery => endpointIds.Contains(delivery.EndpointId) && delivery.ReceivedAt >= since)
            .GroupBy(delivery => delivery.EndpointId)
            .Select(group => new DeliveryTally(
                group.Key,
                group.Count(delivery => delivery.Status == DeliveryStatus.Applied),
                group.Count(delivery => delivery.Status is DeliveryStatus.Failed or DeliveryStatus.Rejected)))
            .ToArray());
}
