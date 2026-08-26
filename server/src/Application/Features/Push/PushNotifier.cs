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
    private readonly ILogger<PushNotifier> _logger;

    public PushNotifier(ShifterDbContext db, PushSender sender, ILogger<PushNotifier> logger)
    {
        _db = db;
        _sender = sender;
        _logger = logger;
    }

    /// <summary>Sends to every device the user has; text is built per language.</summary>
    public async Task NotifyAsync(
        int userId,
        Func<string, (string Title, string Body)> text,
        string url,
        CancellationToken ct)
    {
        if (!_sender.Enabled) return;

        try
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

            await _db.SaveChangesAsync(ct);
        }
        catch (Exception exception) when (exception is not OperationCanceledException)
        {
            _logger.LogWarning(exception, "Push notify failed for user {UserId}", userId);
        }
    }
}
