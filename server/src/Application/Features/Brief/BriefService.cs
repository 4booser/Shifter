using Microsoft.EntityFrameworkCore;

using Shifter.Application.Features.business.DTOs;
using Shifter.Application.Features.business.Services.Interfaces;
using Shifter.Domain.Entities;
using Shifter.Infrastructure.Persistence.DbContexts;

namespace Shifter.Application.Features.Brief;

/// <summary>
/// The daily brief: our numbers, said in words. Facts are gathered from the
/// same handlers the screens use — so the page can never disagree with the
/// calendar — then either dressed by the model or written locally. Cached
/// per person per day; asking again the same day returns the same words.
/// </summary>
public sealed class BriefService
{
    private readonly ShifterDbContext _db;
    private readonly IDayHandler _days;
    private readonly GeminiBriefClient _model;

    public BriefService(ShifterDbContext db, IDayHandler days, GeminiBriefClient model)
    {
        _db = db;
        _days = days;
        _model = model;
    }

    public async Task<DailyBrief> ForTodayAsync(int userId, DateOnly today, CancellationToken ct)
    {
        var existing = await _db.DailyBriefs
            .AsNoTracking()
            .FirstOrDefaultAsync(brief => brief.UserId == userId && brief.Date == today, ct);

        if (existing is not null) return existing;

        var facts = await GatherAsync(userId, today, ct);
        var written = await _model.WriteAsync(facts, ct);
        var (headline, body, tip, mood) = written ?? BriefWriter.Compose(facts);

        var brief = new DailyBrief
        {
            UserId = userId,
            Date = today,
            Headline = headline,
            Body = body,
            Tip = string.IsNullOrWhiteSpace(tip) ? null : tip,
            Mood = mood,
            Source = written is null ? "local" : "model",
        };

        _db.DailyBriefs.Add(brief);

        try
        {
            await _db.SaveChangesAsync(ct);
        }
        catch (DbUpdateException)
        {
            // Two tabs opened the dashboard at once; the first one wins.
            _db.Entry(brief).State = EntityState.Detached;

            return await _db.DailyBriefs
                .AsNoTracking()
                .FirstAsync(row => row.UserId == userId && row.Date == today, ct);
        }

        return brief;
    }

    /// <summary>Only finished numbers, straight from the handlers the screens read.</summary>
    public async Task<BriefFacts> GatherAsync(int userId, DateOnly today, CancellationToken ct)
    {
        var monthFrom = new DateOnly(today.Year, today.Month, 1);
        var monthTo = monthFrom.AddMonths(1).AddDays(-1);

        var month = await _days.ListAsync(userId, monthFrom, monthTo, ct);
        var todayDay = month.days.FirstOrDefault(day => day.date == today);
        var shift = todayDay?.shifts.FirstOrDefault();

        var elapsed = today.Day;
        var perDay = elapsed == 0 ? 0m : month.total_earned / elapsed;
        var projected = Math.Round(perDay * monthTo.Day, 0);

        var goal = await _db.Goals
            .AsNoTracking()
            .Where(row => row.UserId == userId && row.Period == GoalPeriod.Month)
            .OrderByDescending(row => row.Anchor)
            .Select(row => (decimal?)row.Amount)
            .FirstOrDefaultAsync(ct);

        var best = month.days.OrderByDescending(day => day.earned).FirstOrDefault();

        // The streak: consecutive days with work, counting back from today.
        var worked = month.days.Where(day => day.hours > 0).Select(day => day.date).ToHashSet();
        var streak = 0;

        for (var cursor = today; worked.Contains(cursor); cursor = cursor.AddDays(-1)) streak++;

        // The next close of a pay period among the places worked this month.
        var places = await _db.Locations
            .AsNoTracking()
            .Where(place => place.UserId == userId && !place.Archived)
            .ToArrayAsync(ct);

        // The next close of a pay period among the places worked this month:
        // the period holding today ends, and that is when money is counted.
        DateOnly? payday = places
            .Select(place => PayPeriodCalculator.PeriodFor(place, today).To)
            .Where(date => date >= today)
            .OrderBy(date => date)
            .Select(date => (DateOnly?)date)
            .FirstOrDefault();

        return new BriefFacts(
            today.ToString("yyyy-MM-dd"),
            today.DayOfWeek.ToString(),
            shift?.name,
            shift?.start_time,
            shift?.end_time,
            Math.Round(month.total_earned, 0),
            month.days_worked,
            Math.Round(month.hours, 1),
            goal,
            goal is decimal target && target > 0 ? (double)(month.total_earned / target) : null,
            projected,
            streak,
            Math.Round(best?.earned ?? 0m, 0),
            best is null || best.earned <= 0 ? null : best.date.ToString("dd.MM"),
            month.total_earned > 0 ? Math.Round(month.tips_earned / month.total_earned, 3) : 0m,
            payday is DateOnly next ? next.DayNumber - today.DayNumber : null,
            null,
            []);
    }
}
