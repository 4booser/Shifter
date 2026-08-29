using Microsoft.EntityFrameworkCore;

using Shifter.Domain.Entities;
using Shifter.Infrastructure.Persistence.DbContexts;

namespace Shifter.Application.Features.Gigs;

/// <summary>
/// What a job pays in a city, and where somebody's own rate sits in that.
///
/// Built from listings, which are already public — the board is where venues
/// say out loud what they will pay. Nothing here reads anybody's private
/// records, which is what makes the figure safe to publish at all: the
/// alternative, aggregating what people actually earn, is a much better number
/// and a much worse idea.
/// </summary>
public sealed class MarketService
{
    private readonly ShifterDbContext _db;

    public MarketService(ShifterDbContext db) => _db = db;

    /// <summary>
    /// How far back listings count. Half a year is recent enough that the
    /// figure is about now, and long enough that a small city has a sample.
    /// </summary>
    private const int Months = 6;

    public sealed record Reading(
        MarketRate.Band? Band,
        /// <summary>Their own average hourly rate, where they are paid by the hour.</summary>
        decimal? Mine,
        string? Standing);

    public async Task<Reading> ReadAsync(
        int userId, string city, GigCategory category, CancellationToken ct)
    {
        var since = DateOnly.FromDateTime(DateTime.UtcNow).AddMonths(-Months);

        var listings = await _db.GigListings
            .AsNoTracking()
            .Where(listing => listing.City == city
                && listing.Category == category
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

        var samples = listings
            .Select(listing => new MarketRate.Sample(
                listing.OwnerUserId,
                PerHour(listing.PayAmount, listing.PayPeriod, listing.StartTime, listing.EndTime)))
            .Where(sample => sample.PerHour > 0m)
            .ToArray();

        var band = MarketRate.Read(samples);

        var mine = await MineAsync(userId, ct);

        return new Reading(
            band,
            mine,
            band is not null && mine is decimal rate ? MarketRate.Standing(band, rate) : null);
    }

    /// <summary>
    /// A shift price turned into an hourly one over the hours the listing
    /// itself advertises. It is arithmetic on the venue's own two numbers, not
    /// a guess about the shift — but a listing with no hours in it is dropped
    /// rather than divided by zero into something enormous.
    /// </summary>
    private static decimal PerHour(
        decimal amount, string period, TimeOnly start, TimeOnly end)
    {
        if (period == "hour") return amount;

        // Subtracting two times of day already wraps past midnight, so a
        // close from 18:00 to 02:00 comes out as eight hours rather than minus
        // sixteen. A listing with no hours in it at all is dropped rather than
        // divided by zero into something enormous.
        var hours = (end - start).TotalHours;

        return hours <= 0 ? 0m : Math.Round(amount / (decimal)hours, 2);
    }

    /// <summary>
    /// The caller's own hourly rate, averaged over what they actually worked.
    ///
    /// Only from placements priced by the hour: a monthly wage divided by
    /// hours is a different number with a different meaning, and quietly
    /// mixing the two would put a figure in front of somebody that no payslip
    /// of theirs agrees with.
    /// </summary>
    private async Task<decimal?> MineAsync(int userId, CancellationToken ct)
    {
        var since = DateOnly.FromDateTime(DateTime.UtcNow).AddMonths(-Months);

        var rates = await _db.DayShifts
            .AsNoTracking()
            .Where(entry => entry.Worked
                && entry.Day!.UserId == userId
                && entry.Day.Date >= since
                && entry.SalaryPeriod == SalaryPeriod.Hour
                && entry.SalaryAmount > 0m)
            .Select(entry => entry.SalaryAmount!.Value)
            .ToArrayAsync(ct);

        return rates.Length == 0 ? null : Math.Round(rates.Average(), 2);
    }
}
