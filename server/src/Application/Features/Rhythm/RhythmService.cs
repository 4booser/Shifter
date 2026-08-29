using Microsoft.EntityFrameworkCore;

using Shifter.Domain.Entities;
using Shifter.Infrastructure.Persistence.DbContexts;

namespace Shifter.Application.Features.Rhythm;

/// <summary>
/// The rota's rhythm, read back to its owner: the sleep windows between
/// shifts, and whether a long run of days shows up in the tips.
///
/// Deliberately not health advice. It is somebody's own record with the gaps
/// made visible; what that means for them is theirs to decide.
/// </summary>
public sealed class RhythmService
{
    private readonly ShifterDbContext _db;

    public RhythmService(ShifterDbContext db) => _db = db;

    public sealed record Window(
        string Ended,
        string Resumed,
        double Hours,
        bool Short);

    public sealed record RestRead(
        double Threshold,
        Window[] Windows,
        int ShortCount,
        double? Shortest);

    /// <summary>
    /// The gaps between one worked span ending and the next beginning.
    /// Only gaps up to a day long count as windows: a longer gap is a day
    /// off, which is rest of a different kind and not this page's subject.
    /// </summary>
    public async Task<RestRead> RestAsync(int userId, DateOnly from, DateOnly to, CancellationToken ct)
    {
        var threshold = (await _db.Users.AsNoTracking()
            .Where(user => user.Id == userId)
            .Select(user => (double?)user.RestHours)
            .FirstOrDefaultAsync(ct)) ?? RestBetweenShifts.DefaultHours;

        // One extra day each side, so a window straddling the range's edge
        // is measured against the shift that actually bounds it.
        var days = await _db.Days.AsNoTracking()
            .Include(day => day.Shifts)!
            .ThenInclude(entry => entry.Shift)
            .Where(day => day.UserId == userId
                && day.Date >= from.AddDays(-1) && day.Date <= to.AddDays(1))
            .OrderBy(day => day.Date)
            .ToArrayAsync(ct);

        var spans = new List<(DateTime Start, DateTime End)>();

        foreach (var day in days)
        {
            foreach (var entry in (day.Shifts ?? []).Where(entry => entry.Worked))
            {
                // What was actually worked where that was recorded: a shift
                // that ran two hours over ate two hours of the night after it.
                var start = entry.ActualStart ?? entry.StartTime;
                var end = entry.ActualEnd ?? entry.EndTime;

                var begins = day.Date.ToDateTime(start);
                var finishes = day.Date.ToDateTime(end);

                if (finishes <= begins) finishes = finishes.AddDays(1);

                spans.Add((begins, finishes));
            }
        }

        spans.Sort((a, b) => a.Start.CompareTo(b.Start));

        var windows = new List<Window>();
        DateTime? reached = null;

        foreach (var span in spans)
        {
            if (reached is DateTime end)
            {
                var gap = (span.Start - end).TotalHours;

                // Up to 24 hours is a night between working days; longer is
                // a day off. Zero or negative is a double, with no window in
                // it at all.
                if (gap > 0 && gap <= 24 && DateOnly.FromDateTime(span.Start) >= from
                    && DateOnly.FromDateTime(end) <= to.AddDays(1))
                {
                    windows.Add(new Window(
                        end.ToString("yyyy-MM-ddTHH:mm"),
                        span.Start.ToString("yyyy-MM-ddTHH:mm"),
                        Math.Round(gap, 1),
                        gap <= threshold));
                }
            }

            reached = reached is DateTime current && current > span.End ? current : span.End;
        }

        var shortOnes = windows.Where(window => window.Short).ToArray();

        return new RestRead(
            threshold,
            [.. windows],
            shortOnes.Length,
            shortOnes.Length == 0 ? null : shortOnes.Min(window => window.Hours));
    }

    /// <summary>
    /// The fatigue comparison over the last year. A year holds enough runs
    /// to fill both piles for anybody working long stretches at all — and
    /// anybody not working them has nothing to compare and gets silence.
    /// </summary>
    public async Task<FatigueEffect.Verdict?> FatigueAsync(int userId, DateOnly today, CancellationToken ct)
    {
        var from = today.AddDays(-365);

        var days = await _db.Days.AsNoTracking()
            .Include(day => day.Shifts)
            .Where(day => day.UserId == userId && day.Date >= from && day.Date <= today)
            .ToArrayAsync(ct);

        var figures = days
            .Where(day => (day.Shifts ?? []).Any(entry => entry.Worked))
            .Select(day => new FatigueEffect.DayFigures(
                day.Date,
                day.Tips,
                (day.Shifts ?? []).Where(entry => entry.Worked)
                    .Sum(entry => entry.PaidDuration.TotalHours)))
            .ToArray();

        return FatigueEffect.Read(figures);
    }
}
