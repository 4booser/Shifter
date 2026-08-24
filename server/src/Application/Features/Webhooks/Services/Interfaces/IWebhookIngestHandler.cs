using Shifter.Application.Features.Webhooks.DTOs;
using Shifter.Domain.Entities;

namespace Shifter.Application.Features.Webhooks.Services.Interfaces;

public interface IWebhookIngestHandler
{
    /// <summary>
    /// The unauthenticated path: a body arriving from the outside world at the
    /// address the token names. Throws NotFoundException for an unknown or
    /// switched-off endpoint — the same answer for both, so the address cannot
    /// be probed for which tokens exist.
    /// </summary>
    Task<IngestResultDto> ReceiveAsync(
        string token,
        string body,
        DeliveryHeaders headers,
        DateTimeOffset now,
        CancellationToken ct);

    /// <summary>
    /// The same reading and writing without the credential check, for the two
    /// things the owner does from the manager: trying a payload against a
    /// mapping, and replaying one that failed. The endpoint must already have
    /// been fetched for the signed-in caller.
    /// </summary>
    Task<IngestResultDto> RunAsync(
        WebhookEndpoint endpoint,
        string body,
        IngestOptions options,
        CancellationToken ct);
}

/// <summary>
/// What the sender presented to prove it is the endpoint.
///
/// <paramref name="Present"/> is the names — never the values — of the headers
/// it sent that look like they were meant to authenticate it. A sender signing
/// under its own header names is the commonest way this fails, and from the
/// outside it is indistinguishable from one sending nothing at all. Naming what
/// did arrive turns that into a five-second diagnosis.
/// </summary>
public sealed record DeliveryHeaders(
    string? Signature,
    string? Timestamp,
    string? Secret,
    string[]? Present = null,
    /// <summary>
    /// Every header of the request, for the endpoints configured to read a
    /// sender's own signature: which header that is only becomes known once the
    /// endpoint has been looked up, so the whole set has to be carried this far.
    /// Values are used to verify and never written down.
    /// </summary>
    IReadOnlyDictionary<string, string>? All = null)
{
    public string? Named(string? name)
    {
        if (string.IsNullOrWhiteSpace(name) || All is null) return null;

        return All.TryGetValue(name, out string? value) ? value : null;
    }
}

/// <summary>
/// How far a run goes. A test writes nothing and logs nothing; a replay writes
/// and logs but skips the duplicate check, since the id it carries is by
/// definition one this endpoint has already seen.
/// </summary>
public sealed record IngestOptions(bool Apply, bool Log, bool Deduplicate)
{
    public static readonly IngestOptions Delivery = new IngestOptions(true, true, true);
    public static readonly IngestOptions Replay = new IngestOptions(true, true, false);
    public static readonly IngestOptions DryRun = new IngestOptions(false, false, false);
}
