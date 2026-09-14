using Shifter.Application.Features.Webhooks.DTOs;

namespace Shifter.Application.Features.Webhooks.Services.Interfaces;

/// <summary>The manager: what the owner does with their own endpoints.</summary>
public interface IWebhookHandler
{
    Task<WebhookDto[]> ListAsync(int userId, CancellationToken ct);

    Task<WebhookDto> CreateAsync(WebhookSaveDto request, int userId, CancellationToken ct);

    Task<WebhookDto> UpdateAsync(
        WebhookSaveDto request,
        int userId,
        int id,
        CancellationToken ct);

    /// <summary>New token and new secret at once.</summary>
    Task<WebhookDto> RotateAsync(int userId, int id, CancellationToken ct);

    Task DeleteAsync(int userId, int id, CancellationToken ct);

    Task<DeliveryDto[]> DeliveriesAsync(int userId, int id, CancellationToken ct);

    /// <summary>Runs a stored body through the endpoint again — after the mapping was corrected, which is the whole reason…</summary>
    Task<IngestResultDto> ReplayAsync(int userId, int deliveryId, CancellationToken ct);

    /// <summary>Reads a payload the owner pasted in and reports what it would write, touching nothing.</summary>
    Task<IngestResultDto> TestAsync(
        int userId,
        int id,
        string body,
        bool apply,
        CancellationToken ct);
}
