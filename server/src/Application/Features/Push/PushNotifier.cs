using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using Shifter.Infrastructure.Persistence.DbContexts;

namespace Shifter.Application.Features.Push;

/// <summary>
/// Push as a side effect: any handler can tell a user something without
/// learning how subscriptions work.
/// </summary>
public interface IPushNotifier
{
    Task NotifyAsync(
        int userId,
        Func<string, (string Title, string Body)> text,
        string url,
        CancellationToken ct);
}

/// <summary>
/// The real thing. Failures are logged and swallowed — a swap must never
/// die because a phone's push endpoint did.
/// </summary>
public sealed class PushNotifier : IPushNotifier
{
    private readonly ShifterDbContext _db;
    private readonly PushSender _sender;
    private readonly ExpoPushSender _phones;
    private readonly ILogger<PushNotifier> _logger;

    public PushNotifier(
        ShifterDbContext db,
        PushSender sender,
        ExpoPushSender phones,
        ILogger<PushNotifier> logger)
    {
        _db = db;
        _sender = sender;
        _phones = phones;
        _logger = logger;
    }

    /// <summary>Sends to every device the user has; text is built per language.</summary>
    public async Task NotifyAsync(
        int userId,
        Func<string, (string Title, string Body)> text,
        string url,
        CancellationToken ct)
    {
        try
        {
            if (_sender.Enabled)
            {
                var subscriptions = await _db.PushSubscriptions
                    .Where(s => s.UserId == userId)
                    .ToListAsync(ct);

                foreach (var subscription in subscriptions)
                {
                    var (title, body) = text(subscription.Language);

                    if (!await _sender.SendAsync(subscription, title, body, url))
                        _db.PushSubscriptions.Remove(subscription);
                }
            }

            // The same message to every phone the person has signed in on.
            var devices = await _db.DeviceTokens
                .Where(device => device.UserId == userId)
                .ToListAsync(ct);

            foreach (var device in devices)
            {
                var (title, body) = text(device.Language);

                if (!await _phones.SendAsync(device.Token, title, body, url, ct))
                    _db.DeviceTokens.Remove(device);
            }

            await _db.SaveChangesAsync(ct);
        }
        catch (Exception exception) when (exception is not OperationCanceledException)
        {
            _logger.LogWarning(exception, "Push notify failed for user {UserId}", userId);
        }
    }
}
