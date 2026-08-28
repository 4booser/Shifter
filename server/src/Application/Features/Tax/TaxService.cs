using Microsoft.EntityFrameworkCore;

using Shifter.Application.Common.Exceptions;
using Shifter.Domain.Entities;
using Shifter.Infrastructure.Persistence.DbContexts;

namespace Shifter.Application.Features.Tax;

/// <summary>
/// The person's own tax arrangement, and what their own year adds up to under
/// it.
///
/// Nothing here knows any law. It reads the numbers somebody typed off their
/// own registration, counts their own income, and multiplies. What it adds is
/// the running total against the ceiling they entered — the one thing nobody
/// keeps in their head and the one thing people find out too late.
/// </summary>
public sealed class TaxService
{
    private readonly ShifterDbContext _db;

    public TaxService(ShifterDbContext db) => _db = db;

    public async Task<TaxProfile?> GetAsync(int userId, int year, CancellationToken ct)
        => await _db.TaxProfiles
            .AsNoTracking()
            .FirstOrDefaultAsync(row => row.UserId == userId && row.Year == year, ct);

    public sealed record SaveDto(
        string name,
        int year,
        decimal? percent,
        decimal? fixed_monthly,
        decimal? social_monthly,
        decimal? annual_limit,
        string? basis);

    public async Task<TaxProfile> SaveAsync(int userId, SaveDto request, CancellationToken ct)
    {
        var name = (request.name ?? string.Empty).Trim();

        if (name.Length is 0 or > TaxProfile.NameMax)
            throw new ValidationException("Give the arrangement a name.");

        if (request.year is < 2000 or > 2100)
            throw new ValidationException("That is not a year.");

        // A negative rate or a negative ceiling is somebody's typo, and a typo
        // here produces a confident wrong figure about what they owe.
        if (request.percent is < 0m or > 100m)
            throw new ValidationException("A rate is between 0 and 100 per cent.");

        if (request.fixed_monthly < 0m || request.social_monthly < 0m || request.annual_limit < 0m)
            throw new ValidationException("These cannot be negative.");

        var profile = await _db.TaxProfiles
            .FirstOrDefaultAsync(row => row.UserId == userId && row.Year == request.year, ct);

        if (profile is null)
        {
            profile = new TaxProfile { UserId = userId, Name = name, Year = request.year };

            _db.TaxProfiles.Add(profile);
        }

        profile.Name = name;
        profile.Percent = request.percent;
        profile.FixedMonthly = request.fixed_monthly;
        profile.SocialMonthly = request.social_monthly;
        profile.AnnualLimit = request.annual_limit;
        profile.Basis = request.basis == "earned" ? "earned" : "paid";
        profile.UpdatedAt = DateTime.UtcNow;

        await _db.SaveChangesAsync(ct);

        return profile;
    }

    public async Task DeleteAsync(int userId, int year, CancellationToken ct)
    {
        await _db.TaxProfiles
            .Where(row => row.UserId == userId && row.Year == year)
            .ExecuteDeleteAsync(ct);
    }

    public sealed record Reading(TaxProfile Profile, TaxYear.Reading Figures, bool Fell);

    /// <summary>
    /// The year read against the profile.
    ///
    /// The income basis is the person's own choice and it matters here more
    /// than anywhere else in the app: a ceiling is on money that arrived, and
    /// "earned" and "received" are different numbers in a trade that is paid
    /// late. Where they asked for what arrived and have recorded no payments
    /// at all, it falls back to earnings and says so — a zero would read as a
    /// quiet year rather than as an empty ledger.
    /// </summary>
    public async Task<Reading?> ReadAsync(int userId, int year, DateOnly today, CancellationToken ct)
    {
        var profile = await GetAsync(userId, year, ct);

        if (profile is null) return null;

        var from = new DateOnly(year, 1, 1);
        var to = new DateOnly(year, 12, 31);

        decimal paid = 0m;
        var fell = false;

        if (profile.Basis == "paid")
        {
            paid = await _db.Payouts
                .AsNoTracking()
                // The day the money arrived, not the period it was for: a
                // ceiling counts what landed in the year, and January's wage
                // paid in February belongs to February.
                .Where(payout => payout.UserId == userId
                    && payout.ReceivedOn >= from
                    && payout.ReceivedOn <= to)
                .SumAsync(payout => payout.Amount, ct);

            if (paid == 0m) fell = true;
        }

        var income = profile.Basis == "paid" && !fell ? paid : await EarnedAsync(userId, from, to, ct);

        return new Reading(profile, TaxYear.Read(profile, income, today), fell);
    }

    /// <summary>
    /// What the shifts came to over the year.
    ///
    /// Wages and tips both: a ceiling is on income, and a tax authority does
    /// not care which envelope it arrived in.
    /// </summary>
    private async Task<decimal> EarnedAsync(
        int userId, DateOnly from, DateOnly to, CancellationToken ct)
    {
        var days = await _db.Days
            .AsNoTracking()
            .Include(day => day.Shifts)
            .Where(day => day.UserId == userId && day.Date >= from && day.Date <= to)
            .ToArrayAsync(ct);

        return days.Sum(day =>
            (day.Tips ?? 0m) + (day.Shifts ?? []).Where(entry => entry.Worked).Sum(entry => entry.Pay));
    }
}
