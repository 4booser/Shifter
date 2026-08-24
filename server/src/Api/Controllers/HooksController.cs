using System.Text;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Shifter.Application.Common.Exceptions;
using Shifter.Application.Features.Webhooks.DTOs;
using Shifter.Application.Features.Webhooks.Services;
using Shifter.Application.Features.Webhooks.Services.Interfaces;

namespace Shifter.Api.Controllers;

/// <summary>
/// Where the outside world posts. The only unauthenticated write in the
/// application, so everything about it is deliberately narrow: one verb, one
/// route, a body it will not read past a fixed size, and an endpoint that has
/// to prove it knows its own secret before a single field is looked at.
///
/// Nothing here decides anything. It reads the request and hands it on; who may
/// write, to what, and what the payload means all live in the ingest handler.
/// </summary>
[AllowAnonymous]
[Route(WebhookRoutes.Hooks)]
public class HooksController : ControllerBase
{
    /// <summary>
    /// A generous day of line items is a few tens of kilobytes. Past this the
    /// sender is looping or misconfigured, and reading it all into memory to
    /// find that out is the thing worth avoiding.
    /// </summary>
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
            Request.Headers[WebhookSignature.SecretHeader]);

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
