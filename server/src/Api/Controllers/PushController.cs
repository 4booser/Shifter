using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using Shifter.Application.Common.Exceptions;
using Shifter.Application.Features.Push;
using Shifter.Infrastructure.Persistence.DbContexts;
using Entity = Shifter.Domain.Entities.PushSubscription;

namespace Shifter.Api.Controllers;

/// <summary>
/// Web push subscriptions: the browser hands over its endpoint and keys, the
/// scheduler does the rest. Everything here works on the caller's own rows.
/// </summary>
[Authorize]
[Route("shifter/v1/push")]
public class PushController : ControllerBase
{
    private readonly ShifterDbContext _db;
    private readonly PushOptions _options;
    private readonly PushSender _sender;

    public PushController(ShifterDbContext db, IOptions<PushOptions> options, PushSender sender)
    {
        _db = db;
        _options = options.Value;
        _sender = sender;
    }

    /// <summary>
    /// A phone registering its push address. Idempotent by token, so a reopen
    /// refreshes the row rather than growing the table.
    /// </summary>
    [HttpPost("device")]
    public async Task<IActionResult> Device([FromBody] DeviceTokenDto request, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(request.token) || !request.token.StartsWith("ExponentPushToken["))
            throw new ValidationException("That is not an Expo push token.");

        var existing = await _db.DeviceTokens.FirstOrDefaultAsync(device => device.Token == request.token, ct);

        if (existing is null)
        {
            _db.DeviceTokens.Add(new Shifter.Domain.Entities.DeviceToken
            {
                UserId = CurrentUserId(),
                Token = request.token,
                Platform = request.platform ?? "unknown",
                Language = request.language ?? "ru",
            });
        }
        else
        {
            // A phone handed to somebody else must not keep notifying its
            // previous owner, so the row follows the token, not the account.
            existing.UserId = CurrentUserId();
            existing.Platform = request.platform ?? existing.Platform;
            existing.Language = request.language ?? existing.Language;
            existing.LastSeenAt = DateTime.UtcNow;
        }

        await _db.SaveChangesAsync(ct);

        return NoContent();
    }

    [HttpDelete("device/{token}")]
    public async Task<IActionResult> ForgetDevice(string token, CancellationToken ct)
    {
        await _db.DeviceTokens
            .Where(device => device.Token == token && device.UserId == CurrentUserId())
            .ExecuteDeleteAsync(ct);

        return NoContent();
    }

    /// <summary>The applicationServerKey the browser subscribes against.</summary>
    [HttpGet("public-key")]
    public ActionResult PublicKey()
        => _options.Enabled ? Ok(new { key = _options.PublicKey }) : NotFound();

    /// <summary>Upserts by endpoint: re-subscribing updates, never duplicates.</summary>
    [HttpPut("subscription")]
    public async Task<ActionResult> Subscribe([FromBody] PushSubscribeDto request, CancellationToken ct)
    {
        if (!_options.Enabled) return NotFound();

        var userId = CurrentUserId();
        var existing = await _db.PushSubscriptions
            .FirstOrDefaultAsync(s => s.Endpoint == request.Endpoint, ct);

        if (existing is not null && existing.UserId != userId)
        {
            // The browser changed hands (a logout and a different login). The
            // device follows whoever is signed in on it now.
            _db.PushSubscriptions.Remove(existing);
            existing = null;
        }

        if (existing is null)
        {
            existing = new Entity
            {
                UserId = userId,
                Endpoint = request.Endpoint,
                P256dh = request.P256dh,
                Auth = request.Auth,
                TimeZone = request.TimeZone,
                Language = request.Language,
                NotifyAt = request.NotifyAt,
                CreatedAt = DateTime.UtcNow,
            };
            _db.PushSubscriptions.Add(existing);
        }

        existing.P256dh = request.P256dh;
        existing.Auth = request.Auth;
        existing.TimeZone = request.TimeZone;
        existing.Language = request.Language;
        existing.NotifyTomorrow = request.NotifyTomorrow;
        existing.NotifyUnclosed = request.NotifyUnclosed;
        existing.NotifyPayday = request.NotifyPayday;
        existing.NotifyDigest = request.NotifyDigest;
        existing.NotifyOvertime = request.NotifyOvertime;
        existing.NotifyAt = request.NotifyAt;

        await _db.SaveChangesAsync(ct);

        return NoContent();
    }

    [HttpDelete("subscription")]
    public async Task<ActionResult> Unsubscribe([FromBody] PushUnsubscribeDto request, CancellationToken ct)
    {
        await _db.PushSubscriptions
            .Where(s => s.UserId == CurrentUserId() && s.Endpoint == request.Endpoint)
            .ExecuteDeleteAsync(ct);

        return NoContent();
    }

    /// <summary>Fires a real notification at the caller's devices right now.</summary>
    [HttpPost("test")]
    public async Task<ActionResult> Test(CancellationToken ct)
    {
        if (!_options.Enabled) return NotFound();

        var subscriptions = await _db.PushSubscriptions
            .Where(s => s.UserId == CurrentUserId())
            .ToListAsync(ct);

        if (subscriptions.Count == 0) return NotFound();

        foreach (var subscription in subscriptions)
        {
            var (title, body) = subscription.Language switch
            {
                "ru" => ("Уведомления работают", "Так будут выглядеть напоминания от Shifter."),
                "uk" => ("Сповіщення працюють", "Так виглядатимуть нагадування від Shifter."),
                _ => ("Notifications are on", "This is what a Shifter reminder looks like."),
            };

            if (!await _sender.SendAsync(subscription, title, body, "/dashboard"))
                _db.PushSubscriptions.Remove(subscription);
        }

        await _db.SaveChangesAsync(ct);

        return NoContent();
    }

    private int CurrentUserId()
    {
        var id = User.FindFirstValue(ClaimTypes.NameIdentifier);

        if (!int.TryParse(id, out var userId))
            throw new UnauthorizedException("Token is missing the required claims.");

        return userId;
    }
}

public record DeviceTokenDto(string? token, string? platform, string? language);
