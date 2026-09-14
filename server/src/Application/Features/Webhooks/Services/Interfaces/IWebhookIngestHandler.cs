using Shifter.Application.Features.Webhooks.DTOs;
using Shifter.Domain.Entities;

namespace Shifter.Application.Features.Webhooks.Services.Interfaces;

public interface IWebhookIngestHandler
{
    /// <summary>The unauthenticated path: a body arriving from the outside world at the address the token names.</summary>
    Task<IngestResultDto> ReceiveAsync(
        string token,
        string body,
        DeliveryHeaders headers,
        DateTimeOffset now,
        CancellationToken ct);

    /// <summary>The same reading and writing without the credential check, for the two things the owner does from the…</summary>
    Task<IngestResultDto> RunAsync(
        WebhookEndpoint endpoint,
        string body,
        IngestOptions options,
        CancellationToken ct);
}

/// <summary>What the sender presented to prove it is the endpoint.</summary>
public sealed record DeliveryHeaders(
    string? Signature,
    string? Timestamp,
    string? Secret,
    string[]? Present = null,
    /// <summary>Every header of the request, for the endpoints configured to read a sender's own signature: which header that…</summary>
    IReadOnlyDictionary<string, string>? All = null)
{
    public string? Named(string? name)
    {
        if (string.IsNullOrWhiteSpace(name) || All is null) return null;

        return All.TryGetValue(name, out string? value) ? value : null;
    }
}

/// <summary>How far a run goes.</summary>
public sealed record IngestOptions(bool Apply, bool Log, bool Deduplicate)
{
    public static readonly IngestOptions Delivery = new IngestOptions(true, true, true);
    public static readonly IngestOptions Replay = new IngestOptions(true, true, false);
    public static readonly IngestOptions DryRun = new IngestOptions(false, false, false);
}
