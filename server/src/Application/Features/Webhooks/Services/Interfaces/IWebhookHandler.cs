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

    /// <summary>
    /// New token and new secret at once. Rotating only the secret would leave
    /// the old URL live for anyone who kept a copy of it.
    /// </summary>
    Task<WebhookDto> RotateAsync(int userId, int id, CancellationToken ct);

    Task DeleteAsync(int userId, int id, CancellationToken ct);

    Task<DeliveryDto[]> DeliveriesAsync(int userId, int id, CancellationToken ct);

    /// <summary>
    /// Runs a stored body through the endpoint again — after the mapping was
    /// corrected, which is the whole reason the bodies are kept.
    /// </summary>
    Task<IngestResultDto> ReplayAsync(int userId, int deliveryId, CancellationToken ct);

    /// <summary>
    /// Reads a payload the owner pasted in and reports what it would write,
    /// touching nothing. Getting a mapping right by watching a real till retry
    /// every hour is nobody's idea of a good afternoon.
    /// </summary>
    Task<IngestResultDto> TestAsync(
        int userId,
        int id,
        string body,
        bool apply,
        CancellationToken ct);
}
