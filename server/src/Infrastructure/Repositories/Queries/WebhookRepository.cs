using Microsoft.EntityFrameworkCore;
using Shifter.Domain.Entities;
using Shifter.Infrastructure.Persistence.DbContexts;
using Shifter.Infrastructure.Repositories.Interfaces;

namespace Shifter.Infrastructure.Repositories.Queries;

public class WebhookRepository : IWebhookRepository
{
    private readonly ShifterDbContext _db;

    public WebhookRepository(ShifterDbContext db) => _db = db;

    public async Task<WebhookEndpoint[]> GetForUserAsync(int userId, CancellationToken ct)
    {
        return await _db.WebhookEndpoints
            .AsNoTracking()
            .Include(hook => hook.DefaultShift)
            .Where(hook => hook.UserId == userId)
            .OrderBy(hook => hook.Name)
            .ToArrayAsync(ct);
    }

    public async Task<WebhookEndpoint?> GetAsync(int userId, int id, CancellationToken ct)
    {
        return await _db.WebhookEndpoints
            .Include(hook => hook.DefaultShift)
            .FirstOrDefaultAsync(hook => hook.UserId == userId && hook.Id == id, ct);
    }

    public async Task<WebhookEndpoint?> GetByTokenAsync(string token, CancellationToken ct)
    {
        // Tracked: the receiving side stamps LastDeliveryAt on it.
        return await _db.WebhookEndpoints
            .Include(hook => hook.DefaultShift)
            .FirstOrDefaultAsync(hook => hook.Token == token, ct);
    }

    public async Task<bool> TokenExistsAsync(string token, CancellationToken ct)
        => await _db.WebhookEndpoints.AnyAsync(hook => hook.Token == token, ct);

    public async Task AddAsync(WebhookEndpoint endpoint, CancellationToken ct)
    {
        await _db.WebhookEndpoints.AddAsync(endpoint, ct);
        await _db.SaveChangesAsync(ct);
    }

    public async Task RemoveAsync(WebhookEndpoint endpoint, CancellationToken ct)
    {
        _db.WebhookEndpoints.Remove(endpoint);
        await _db.SaveChangesAsync(ct);
    }

    public async Task SaveAsync(CancellationToken ct) => await _db.SaveChangesAsync(ct);

    public async Task<WebhookDelivery[]> GetDeliveriesAsync(
        int endpointId,
        int take,
        CancellationToken ct)
    {
        return await _db.WebhookDeliveries
            .AsNoTracking()
            .Where(delivery => delivery.EndpointId == endpointId)
            .OrderByDescending(delivery => delivery.ReceivedAt)
            .ThenByDescending(delivery => delivery.Id)
            .Take(take)
            .ToArrayAsync(ct);
    }

    public async Task<WebhookDelivery?> GetDeliveryAsync(
        int userId,
        int deliveryId,
        CancellationToken ct)
    {
        // Joined through the endpoint rather than scoped by it: a replay is
        // reached by the delivery's own id, and without the owner in the
        // predicate any signed-in caller could replay a stranger's body.
        return await _db.WebhookDeliveries
            .AsNoTracking()
            .Include(delivery => delivery.Endpoint)
            .ThenInclude(hook => hook!.DefaultShift)
            .FirstOrDefaultAsync(
                delivery => delivery.Id == deliveryId
                    && delivery.Endpoint!.UserId == userId,
                ct);
    }

    public async Task<bool> DeliveryExistsAsync(
        int endpointId,
        string externalId,
        CancellationToken ct)
    {
        return await _db.WebhookDeliveries.AnyAsync(
            delivery => delivery.EndpointId == endpointId
                && delivery.ExternalId == externalId,
            ct);
    }

    public async Task AddDeliveryAsync(WebhookDelivery delivery, CancellationToken ct)
    {
        await _db.WebhookDeliveries.AddAsync(delivery, ct);
        await _db.SaveChangesAsync(ct);

        // Trim after the insert rather than before, so the cap counts this one.
        // Deleting by a keyset rather than by date: two deliveries can share a
        // timestamp to the microsecond when a sender batches its retries.
        int[] going = await _db.WebhookDeliveries
            .Where(item => item.EndpointId == delivery.EndpointId)
            .OrderByDescending(item => item.ReceivedAt)
            .ThenByDescending(item => item.Id)
            .Skip(WebhookDelivery.KeepPerEndpoint)
            .Select(item => item.Id)
            .ToArrayAsync(ct);

        if (going.Length == 0) return;

        await _db.WebhookDeliveries
            .Where(item => going.Contains(item.Id))
            .ExecuteDeleteAsync(ct);
    }

    public async Task<DeliveryTally[]> TallyAsync(
        int[] endpointIds,
        DateTime since,
        CancellationToken ct)
    {
        return await _db.WebhookDeliveries
            .Where(delivery => endpointIds.Contains(delivery.EndpointId)
                && delivery.ReceivedAt >= since)
            .GroupBy(delivery => delivery.EndpointId)
            .Select(group => new DeliveryTally(
                group.Key,
                group.Count(delivery => delivery.Status == DeliveryStatus.Applied),
                group.Count(delivery => delivery.Status == DeliveryStatus.Failed
                    || delivery.Status == DeliveryStatus.Rejected)))
            .ToArrayAsync(ct);
    }
}
