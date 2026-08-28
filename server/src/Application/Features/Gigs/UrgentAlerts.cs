using Microsoft.EntityFrameworkCore;

using Shifter.Application.Features.Push;
using Shifter.Domain.Entities;
using Shifter.Infrastructure.Persistence.DbContexts;

namespace Shifter.Application.Features.Gigs;

/// <summary>
/// Telling the right few people that somebody has not turned up.
///
/// This is the only notification in the app that reaches anybody without a
/// subscription, and it is defensible for one reason: every person it reaches
/// has published a card saying they are looking for work, in this trade, in
/// this city — and their own calendar says the day is free. All of those have
/// to be true. A push that fails any of them is the kind that gets an app
/// uninstalled, and there is no second chance at that.
/// </summary>
public sealed class UrgentAlerts
{
    /// <summary>
    /// Nobody is told about more than this many at once, however busy a night
    /// gets. A phone that buzzes six times in an evening is a phone with
    /// notifications turned off tomorrow.
    /// </summary>
    private const int MostPerDay = 2;

    private readonly ShifterDbContext _db;
    private readonly IPushNotifier _push;

    public UrgentAlerts(ShifterDbContext db, IPushNotifier push)
    {
        _db = db;
        _push = push;
    }

    public async Task RaiseAsync(GigListing gig, CancellationToken ct)
    {
        // Looking for work, in this trade, in this city. The card is the
        // consent; without one nobody hears about this at all.
        GigSeeker[] seekers = await _db.GigSeekers
            .AsNoTracking()
            .Where(seeker => seeker.IsActive
                && seeker.UserId != gig.OwnerUserId
                && seeker.City.ToLower() == gig.City.ToLower())
            .ToArrayAsync(ct);

        int[] wanted = seekers
            .Where(seeker => seeker.CategoriesCsv
                .Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
                .Contains(gig.Category.ToString(), StringComparer.OrdinalIgnoreCase))
            .Select(seeker => seeker.UserId)
            .ToArray();

        if (wanted.Length == 0) return;

        // And free that day. Somebody already on shift cannot take this one,
        // and telling them anyway is the fastest way to teach them that these
        // notifications are not worth reading.
        int[] busy = await _db.Days
            .AsNoTracking()
            .Where(day => wanted.Contains(day.UserId)
                && day.Date == gig.Date
                && day.Shifts!.Any())
            .Select(day => day.UserId)
            .Distinct()
            .ToArrayAsync(ct);

        // Two an evening, and no more. The count is of alerts already sent
        // today for listings on this date.
        DateTime since = DateTime.UtcNow.AddHours(-12);

        int[] alreadyTold = await _db.GigListings
            .AsNoTracking()
            .Where(other => other.Urgent && other.AlertedAt >= since && other.Id != gig.Id)
            .Select(other => other.OwnerUserId)
            .ToArrayAsync(ct);

        string when = $"{gig.StartTime:HH\\:mm}";

        foreach (int userId in wanted.Except(busy))
        {
            if (alreadyTold.Count(id => id == userId) >= MostPerDay) continue;

            await _push.NotifyAsync(
                userId,
                language => language switch
                {
                    "ru" => ("Срочно нужен человек", $"{gig.Venue}, сегодня с {when}. {gig.Title}."),
                    "uk" => ("Терміново потрібна людина", $"{gig.Venue}, сьогодні з {when}. {gig.Title}."),
                    _ => ("Somebody is needed tonight", $"{gig.Venue}, from {when} today. {gig.Title}."),
                },
                "/gigs",
                ct);
        }
    }
}
