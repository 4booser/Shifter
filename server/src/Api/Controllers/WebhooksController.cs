using System.Security.Claims;
using System.Text;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Shifter.Application.Common.Exceptions;
using Shifter.Application.Features.Webhooks.DTOs;
using Shifter.Application.Features.Webhooks.Services.Interfaces;

namespace Shifter.Api.Controllers;

/// <summary>
/// The manager: the owner's side of the webhooks. Every route works on the
/// caller's own endpoints, and the address anyone actually posts to lives in
/// <see cref="HooksController"/>, which is the only part of this that answers
/// without a token of ours.
/// </summary>
[Authorize]
[Route("shifter/v1/webhooks")]
public class WebhooksController : ControllerBase
{
    /// <summary>A pasted example payload, not a delivery: far smaller.</summary>
    private const int MaxTestBytes = 64 * 1024;

    private readonly IWebhookHandler _webhooks;

    public WebhooksController(IWebhookHandler webhooks) => _webhooks = webhooks;

    [HttpGet]
    public async Task<ActionResult<WebhookDto[]>> List(CancellationToken ct)
        => Ok(await _webhooks.ListAsync(CurrentUserId(), ct));

    [HttpPost]
    public async Task<ActionResult<WebhookDto>> Create(
        [FromBody] WebhookSaveDto request,
        CancellationToken ct)
        => Ok(await _webhooks.CreateAsync(request, CurrentUserId(), ct));

    [HttpPut]
    [Route("{id:int}")]
    public async Task<ActionResult<WebhookDto>> Update(
        int id,
        [FromBody] WebhookSaveDto request,
        CancellationToken ct)
        => Ok(await _webhooks.UpdateAsync(request, CurrentUserId(), id, ct));

    /// <summary>
    /// New address and new key together, for when either has been somewhere it
    /// should not have been. Deliveries signed with the old one stop arriving
    /// the moment this returns.
    /// </summary>
    [HttpPost]
    [Route("{id:int}/token")]
    public async Task<ActionResult<WebhookDto>> Rotate(int id, CancellationToken ct)
        => Ok(await _webhooks.RotateAsync(CurrentUserId(), id, ct));

    [HttpDelete]
    [Route("{id:int}")]
    public async Task<IActionResult> Delete(int id, CancellationToken ct)
    {
        await _webhooks.DeleteAsync(CurrentUserId(), id, ct);

        return NoContent();
    }

    /// <summary>What arrived lately, with the bodies as they were sent.</summary>
    [HttpGet]
    [Route("{id:int}/deliveries")]
    public async Task<ActionResult<DeliveryDto[]>> Deliveries(int id, CancellationToken ct)
        => Ok(await _webhooks.DeliveriesAsync(CurrentUserId(), id, ct));

    /// <summary>
    /// Runs a stored body through the endpoint again, which is what makes a
    /// corrected mapping worth anything: the night that failed can be recovered
    /// without asking the sender to send it twice.
    /// </summary>
    [HttpPost]
    [Route("deliveries/{deliveryId:int}/replay")]
    public async Task<ActionResult<IngestResultDto>> Replay(
        int deliveryId,
        CancellationToken ct)
        => Ok(await _webhooks.ReplayAsync(CurrentUserId(), deliveryId, ct));

    /// <summary>
    /// Reads a pasted payload and reports what it would write. Writes nothing
    /// unless asked, so a mapping can be worked out against a real example
    /// without a calendar filling up with attempts.
    /// </summary>
    [HttpPost]
    [Route("{id:int}/test")]
    public async Task<ActionResult<IngestResultDto>> Test(
        int id,
        [FromQuery] bool apply,
        CancellationToken ct)
        => Ok(await _webhooks.TestAsync(CurrentUserId(), id, await ReadBodyAsync(ct), apply, ct));

    private async Task<string> ReadBodyAsync(CancellationToken ct)
    {
        byte[] buffer = new byte[MaxTestBytes + 1];
        int filled = 0;

        while (filled < buffer.Length)
        {
            int read = await Request.Body.ReadAsync(buffer.AsMemory(filled), ct);

            if (read == 0) break;

            filled += read;
        }

        if (filled > MaxTestBytes)
            throw new ValidationException("That payload is too large to try here.");

        return Encoding.UTF8.GetString(buffer, 0, filled);
    }

    /// <summary>
    /// Read from the token, never from the request — the same rule as
    /// everywhere else, and the reason an endpoint can only ever be reached by
    /// the account that made it.
    /// </summary>
    private int CurrentUserId()
    {
        var id = User.FindFirstValue(ClaimTypes.NameIdentifier);

        if (!int.TryParse(id, out var userId))
            throw new UnauthorizedException("Token is missing the required claims.");

        return userId;
    }
}
