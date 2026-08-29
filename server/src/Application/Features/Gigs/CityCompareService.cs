using Microsoft.EntityFrameworkCore;

using Shifter.Domain.Entities;
using Shifter.Infrastructure.Persistence.DbContexts;

namespace Shifter.Application.Features.Gigs;

/// <summary>
/// «Где мой час дороже» — the seasonal worker's question, answered from
/// their own history city by city, with the public market band alongside
/// where the sample clears the anonymity thresholds.
///
/// Own rates come only from the person's own worked hourly placements at
/// places they tagged with a city. Market bands reuse MarketRate whole —
/// same five-employers floor, same loudest-voice guard — filtered to the
/// trade the person says they work (their seeker profile's first category).
/// No profile, no market column: a band for «any trade at all» would mix a
/// chef into a runner's median and mean nothing.
/// </summary>
public sealed class CityCompareService
{
    private readonly ShifterDbContext _db;

    public CityCompareService(ShifterDbContext db) => _db = db;

    public sealed record CityRow(
        string City,
        double Hours,
        int Days,
        decimal PerHour,
        MarketRate.Band? Market);

    public async Task<CityRow[]> ReadAsync(int userId, CancellationToken ct)
    {
        // Their own hourly history, grouped by the city they gave the place.
        var placements = await _db.DayShifts.AsNoTracking()
            .Where(entry => entry.Worked
                && entry.Day!.UserId == userId
                && entry.Shift!.Location!.City != null
                && entry.SalaryPeriod == SalaryPeriod.Hour)
            .Select(entry => new
            {
                City = entry.Shift!.Location!.City!,
                Date = entry.Day!.Date,
                entry.Pay,
                Duration = entry.PaidDuration,
            })
            .ToArrayAsync(ct);

        if (placements.Length == 0) return [];

        var category = await SeekerCategoryAsync(userId, ct);
        var since = DateOnly.FromDateTime(DateTime.UtcNow).AddMonths(-6);

        var rows = new List<CityRow>();

        foreach (var group in placements.GroupBy(entry => entry.City))
        {
            var hours = group.Sum(entry => entry.Duration.TotalHours);

            if (hours <= 0) continue;

            MarketRate.Band? market = null;

            if (category is GigCategory trade)
            {
                var listings = await _db.GigListings.AsNoTracking()
                    .Where(listing => listing.City == group.Key
                        && listing.Category == trade
                        && listing.Date >= since
                        && listing.PayAmount > 0m)
                    .Select(listing => new
                    {
                        listing.OwnerUserId,
                        listing.PayAmount,
                        listing.PayPeriod,
                        listing.StartTime,
                        listing.EndTime,
                    })
                    .ToArrayAsync(ct);

                // Same normalisation as the market page: a whole-shift figure
                // becomes per-hour through the shift's own advertised times.
                market = MarketRate.Read(listings
                    .Select(listing => new MarketRate.Sample(
                        listing.OwnerUserId,
                        MarketService.PerHour(
                            listing.PayAmount, listing.PayPeriod, listing.StartTime, listing.EndTime)))
                    .Where(sample => sample.PerHour > 0m)
                    .ToArray());
            }

            rows.Add(new CityRow(
                group.Key,
                Math.Round(hours, 1),
                group.Select(entry => entry.Date).Distinct().Count(),
                Math.Round(group.Sum(entry => entry.Pay) / (decimal)hours, 2),
                market));
        }

        return [.. rows.OrderByDescending(row => row.PerHour)];
    }

    private async Task<GigCategory?> SeekerCategoryAsync(int userId, CancellationToken ct)
    {
        var csv = await _db.GigSeekers.AsNoTracking()
            .Where(seeker => seeker.UserId == userId)
            .Select(seeker => seeker.CategoriesCsv)
            .FirstOrDefaultAsync(ct);

        var first = csv?.Split(',', StringSplitOptions.RemoveEmptyEntries).FirstOrDefault()?.Trim();

        return Enum.TryParse<GigCategory>(first, ignoreCase: true, out var parsed) ? parsed : null;
    }
}
