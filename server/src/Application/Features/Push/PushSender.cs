using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using System.Text.Json;
using WebPush;
using Entity = Shifter.Domain.Entities.PushSubscription;

namespace Shifter.Application.Features.Push;

/// <summary>
/// The single place a notification physically leaves from. Wraps the VAPID
/// client and owns the one piece of bookkeeping senders always forget: a
/// push service answering 404 or 410 means the browser is gone, and the row
/// must go with it or every later pass wastes a request on a corpse.
/// </summary>
public sealed class PushSender
{
    private readonly PushOptions _options;
    private readonly ILogger<PushSender> _logger;

    public PushSender(IOptions<PushOptions> options, ILogger<PushSender> logger)
    {
        _options = options.Value;
        _logger = logger;
    }

    public bool Enabled => _options.Enabled;

    /// <summary>
    /// Sends one notification. Returns false when the subscription is dead
    /// and should be deleted; transient failures just log and count as sent.
    /// </summary>
    public async Task<bool> SendAsync(Entity subscription, string title, string body, string url)
    {
        if (!_options.Enabled) return true;

        var payload = JsonSerializer.Serialize(new { title, body, url });
        var target = new PushSubscription(subscription.Endpoint, subscription.P256dh, subscription.Auth);
        var vapid = new VapidDetails(_options.Subject, _options.PublicKey, _options.PrivateKey);

        using var client = new WebPushClient();

        try
        {
            await client.SendNotificationAsync(target, payload, vapid);

            return true;
        }
        catch (WebPushException exception)
            when (exception.StatusCode is System.Net.HttpStatusCode.NotFound
                or System.Net.HttpStatusCode.Gone)
        {
            return false;
        }
        catch (Exception exception)
        {
            // The push service being briefly unreachable is its problem, not a
            // reason to drop the subscription or crash a scheduler pass.
            _logger.LogWarning(exception, "Push delivery failed for subscription {Id}", subscription.Id);

            return true;
        }
    }
}
