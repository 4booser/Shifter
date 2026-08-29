using Microsoft.EntityFrameworkCore;

using Shifter.Domain.Entities;
using Shifter.Infrastructure.Persistence.DbContexts;

namespace Shifter.Application.Features.Health;

/// <summary>
/// The holes in the record, said out loud as a map — not a moral.
///
/// The analytics are exactly as good as the records under them: a worked day
/// with no tips figure quietly understates every «чай по дням недели»; a
/// place without a city never reaches the cities comparison; a shift without
/// actual times feeds the sleep windows its planned hours. Nobody sees these
/// gaps in one place, so nobody closes them. This lists each kind, how many,
/// a few examples, and which feature is undercounting because of it.
/// </summary>
public sealed class RecordsHealthService
{
    private readonly ShifterDbContext _db;

    public RecordsHealthService(ShifterDbContext db) => _db = db;

    public sealed record Gap(
        string Kind,
        int Count,
        /// <summary>Up to three examples — dates or names, whichever the kind has.</summary>
        string[] Sample,
        /// <summary>Which feature undercounts while this stays unfilled.</summary>
        string Hurts);

    public async Task<Gap[]> ReadAsync(int userId, DateOnly today, CancellationToken ct)
    {
        var since = today.AddDays(-60);
        var gaps = new List<Gap>();

        // Worked days where nobody said the tips. Sixty days, because older
        // holes are history nobody will refill honestly.
        var tipless = await _db.Days.AsNoTracking()
            .Where(day => day.UserId == userId
                && day.Date >= since && day.Date <= today
                && day.Tips == null && day.TipPool == null
                && day.Shifts!.Any(entry => entry.Worked))
            .OrderByDescending(day => day.Date)
            .Select(day => day.Date)
            .ToArrayAsync(ct);

        if (tipless.Length > 0)
        {
            gaps.Add(new Gap(
                "tips_unsaid",
                tipless.Length,
                [.. tipless.Take(3).Select(date => date.ToString("yyyy-MM-dd"))],
                "weekday_tips"));
        }

        // Places without a city never enter «где мой час дороже».
        var cityless = await _db.Locations.AsNoTracking()
            .Where(place => place.UserId == userId && !place.Archived && place.City == null)
            .Select(place => place.Name)
            .ToArrayAsync(ct);

        if (cityless.Length > 0)
            gaps.Add(new Gap("city_unsaid", cityless.Length, [.. cityless.Take(3)], "cities"));

        // Worked placements running on planned times: the sleep windows are
        // then measured against the rota, not the night.
        var untimed = await _db.DayShifts.AsNoTracking()
            .Where(entry => entry.Worked
                && entry.Day!.UserId == userId
                && entry.Day.Date >= since && entry.Day.Date <= today
                && entry.ActualStart == null)
            .OrderByDescending(entry => entry.Day!.Date)
            .Select(entry => entry.Day!.Date)
            .ToArrayAsync(ct);

        if (untimed.Length > 0)
        {
            gaps.Add(new Gap(
                "actual_times_unsaid",
                untimed.Length,
                [.. untimed.Distinct().Take(3).Select(date => date.ToString("yyyy-MM-dd"))],
                "rest_windows"));
        }

        // An hourly shift at a zero rate: worked, counted, worth nothing —
        // almost always a template somebody forgot to price.
        var unpriced = await _db.DayShifts.AsNoTracking()
            .Where(entry => entry.Worked
                && entry.Day!.UserId == userId
                && entry.Day.Date >= since && entry.Day.Date <= today
                && entry.SalaryPeriod == SalaryPeriod.Hour
                && (entry.SalaryAmount == null || entry.SalaryAmount == 0))
            .OrderByDescending(entry => entry.Day!.Date)
            .Select(entry => entry.Day!.Date)
            .ToArrayAsync(ct);

        if (unpriced.Length > 0)
        {
            gaps.Add(new Gap(
                "rate_zero",
                unpriced.Length,
                [.. unpriced.Distinct().Take(3).Select(date => date.ToString("yyyy-MM-dd"))],
                "earnings"));
        }

        return [.. gaps];
    }
}
