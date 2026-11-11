using Microsoft.EntityFrameworkCore;

using Shifter.Infrastructure.Persistence.DbContexts;

namespace Shifter.Application.Common.Time;

/// <summary>Where people have said they are, for anything that has to work out their date without them there to ask.</summary>
public static class UserZones
{
    /// <summary>Where each person said they are: the newest phone, else a browser, else the Telegram chat. Three reads, however many people are asked about.</summary>
    public static async Task<Dictionary<int, string>> OfAsync(
        ShifterDbContext db,
        int[] users,
        CancellationToken ct)
    {
        var phones = await db.DeviceTokens
            .AsNoTracking()
            .Where(device => users.Contains(device.UserId))
            .OrderByDescending(device => device.LastSeenAt)
            .Select(device => new { device.UserId, device.TimeZone })
            .ToArrayAsync(ct);

        var browsers = await db.PushSubscriptions
            .AsNoTracking()
            .Where(subscription => users.Contains(subscription.UserId))
            .OrderByDescending(subscription => subscription.CreatedAt)
            .Select(subscription => new { subscription.UserId, subscription.TimeZone })
            .ToArrayAsync(ct);

        var chats = await db.TelegramLinks
            .AsNoTracking()
            .Where(link => users.Contains(link.UserId))
            .Select(link => new { link.UserId, link.TimeZone })
            .ToArrayAsync(ct);

        Dictionary<int, string> zones = [];

        foreach (var row in phones.Concat(browsers).Concat(chats)) zones.TryAdd(row.UserId, row.TimeZone);

        return zones;
    }
}
