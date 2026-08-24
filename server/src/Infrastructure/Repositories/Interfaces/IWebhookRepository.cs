using Shifter.Domain.Entities;

namespace Shifter.Infrastructure.Repositories.Interfaces;

public interface IWebhookRepository
{
    Task<WebhookEndpoint[]> GetForUserAsync(int userId, CancellationToken ct);

    /// <summary>Owner-scoped, tracked, for editing.</summary>
    Task<WebhookEndpoint?> GetAsync(int userId, int id, CancellationToken ct);

    /// <summary>
    /// The endpoint an incoming request claims to be. Not scoped to a user —
    /// the caller has no account — so the token alone decides whose calendar is
    /// about to be written to, and it is the only lookup in the application
    /// that works that way. Inactive endpoints come back too, so the receiving
    /// side can answer them exactly as it answers an unknown token rather than
    /// leaking which of the two it was.
    /// </summary>
    Task<WebhookEndpoint?> GetByTokenAsync(string token, CancellationToken ct);

    Task<bool> TokenExistsAsync(string token, CancellationToken ct);

    Task AddAsync(WebhookEndpoint endpoint, CancellationToken ct);
    Task RemoveAsync(WebhookEndpoint endpoint, CancellationToken ct);
    Task SaveAsync(CancellationToken ct);

    /// <summary>Newest first, capped: the log is for the last few days, not for ever.</summary>
    Task<WebhookDelivery[]> GetDeliveriesAsync(int endpointId, int take, CancellationToken ct);

    /// <summary>One stored delivery of the caller's own, for replaying it.</summary>
    Task<WebhookDelivery?> GetDeliveryAsync(int userId, int deliveryId, CancellationToken ct);

    /// <summary>
    /// Whether this endpoint already saw the sender's id. The unique index is
    /// the real guarantee; this is what turns the second copy into a civil
    /// answer instead of a constraint violation.
    /// </summary>
    Task<bool> DeliveryExistsAsync(int endpointId, string externalId, CancellationToken ct);

    /// <summary>
    /// Records the arrival and trims the endpoint's log back to its cap. Saves
    /// on its own connection-level operation so a rejected delivery is still
    /// logged when the surrounding work was rolled back.
    /// </summary>
    Task AddDeliveryAsync(WebhookDelivery delivery, CancellationToken ct);

    /// <summary>
    /// How the recent arrivals went, for every endpoint at once. The list
    /// screen shows it against each row, and reading it per endpoint would be a
    /// query per row for a number nobody needs to the minute.
    /// </summary>
    Task<DeliveryTally[]> TallyAsync(int[] endpointIds, DateTime since, CancellationToken ct);
}

/// <summary>
/// Recent arrivals at one endpoint. Duplicates count as neither: a sender
/// retrying after a timeout is working exactly as intended.
/// </summary>
public sealed record DeliveryTally(int EndpointId, int Applied, int Failed);
