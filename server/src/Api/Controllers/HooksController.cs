using System.Text;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Shifter.Application.Common.Exceptions;
using Shifter.Application.Features.Webhooks.DTOs;
using Shifter.Application.Features.Webhooks.Services;
using Shifter.Application.Features.Webhooks.Services.Interfaces;

namespace Shifter.Api.Controllers;

/// <summary>Where the outside world posts.</summary>
[AllowAnonymous]
[Route(WebhookRoutes.Hooks)]
public class HooksController : ControllerBase
{
    /// <summary>A generous day of line items is a few tens of kilobytes.</summary>
    private const int MaxBodyBytes = 256 * 1024;

    private readonly IWebhookIngestHandler _ingest;

    public HooksController(IWebhookIngestHandler ingest) => _ingest = ingest;

    [HttpPost]
    [Route("{token}")]
    public async Task<IActionResult> Receive(string token, CancellationToken ct)
    {
        string body = await ReadBodyAsync(ct);

        DeliveryHeaders headers = new DeliveryHeaders(
            Request.Headers[WebhookSignature.SignatureHeader],
            Request.Headers[WebhookSignature.TimestampHeader],
            Request.Headers[WebhookSignature.SecretHeader],
            AuthHeaderNames(),
            Request.Headers.ToDictionary(
                header => header.Key,
                header => header.Value.ToString(),
                StringComparer.OrdinalIgnoreCase));

        IngestResultDto result = await _ingest.ReceiveAsync(
            token,
            body,
            headers,
            DateTimeOffset.UtcNow,
            ct);

        // Only what the sender needs to know it worked. The preview carries the
        // account's own catalogue prices, and a till has no business with them.
        return Ok(new { status = result.status, date = result.date });
    }

    /// <summary>Words that mark a header as an attempt to authenticate.</summary>
    private static readonly string[] AuthWords =
        ["sign", "secret", "hmac", "digest", "webhook", "svix", "timestamp", "token"];

    /// <summary>Names only, never values: whatever the sender is presenting as its credential is the one thing that must not…</summary>
    private string[] AuthHeaderNames()
    {
        return Request.Headers.Keys
            .Where(name => AuthWords.Any(word =>
                name.Contains(word, StringComparison.OrdinalIgnoreCase)))
            .Order(StringComparer.OrdinalIgnoreCase)
            .ToArray();
    }

    private async Task<string> ReadBodyAsync(CancellationToken ct)
    {
        if (Request.ContentLength > MaxBodyBytes)
            throw new ValidationException("The body is too large.");

        // Read against the cap rather than trusting the declared length: a
        // chunked request declares nothing at all.
        byte[] buffer = new byte[MaxBodyBytes + 1];
        int filled = 0;

        while (filled < buffer.Length)
        {
            int read = await Request.Body.ReadAsync(buffer.AsMemory(filled), ct);

            if (read == 0) break;

            filled += read;
        }

        if (filled > MaxBodyBytes)
            throw new ValidationException("The body is too large.");

        if (filled == 0)
            throw new ValidationException("The body is empty.");

        return Encoding.UTF8.GetString(buffer, 0, filled);
    }
}
