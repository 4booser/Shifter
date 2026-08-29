using Microsoft.EntityFrameworkCore;

using Shifter.Application.Features.business.DTOs;
using Shifter.Application.Features.business.Services.Interfaces;
using Shifter.Domain.Entities;
using Shifter.Infrastructure.Persistence.DbContexts;

using Shifter.Application.Common.Text;

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
    private readonly IReconciliationHandler _reconciliation;

    public BriefService(
        ShifterDbContext db,
        IDayHandler days,
        GeminiBriefClient model,
        IReconciliationHandler reconciliation)
    {
        _db = db;
        _days = days;
        _model = model;
        _reconciliation = reconciliation;
    }

    public async Task<DailyBrief> ForTodayAsync(
        int userId,
        DateOnly today,
        CancellationToken ct,
        string? lang = null)
    {
        var language = Say.Known(lang);

        var existing = await _db.DailyBriefs
            .AsNoTracking()
            .FirstOrDefaultAsync(
                brief => brief.UserId == userId && brief.Date == today && brief.Language == language,
                ct);

        var facts = await GatherAsync(userId, today, ct);

        // Same day, same money: the words still describe the situation, so
        // they stand. Once the month has moved they do not, and a paragraph
        // quoting yesterday's total beside a table showing today's reads as a
        // bug rather than as a cache.
        if (existing is not null && existing.EarnedAtWriting == facts.MonthEarned) return existing;

        if (existing is not null)
        {
            await _db.DailyBriefs
                .Where(brief => brief.Id == existing.Id)
                .ExecuteDeleteAsync(ct);
        }
        var written = await _model.WriteAsync(facts, ct, language);
        var (headline, body, tip, mood) = written ?? BriefWriter.Compose(facts, language);

        var brief = new DailyBrief
        {
            UserId = userId,
            Date = today,
            Headline = headline,
            Body = body,
            Tip = string.IsNullOrWhiteSpace(tip) ? null : tip,
            Mood = mood,
            Source = written is null ? "local" : "model",
            Language = language,
            EarnedAtWriting = facts.MonthEarned,
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

    /// <summary>
    /// The day page: the same brief, plus everything the figures noticed,
    /// arranged in blocks. The paragraph at the top may be the model's; not
    /// one line below it is — those are arithmetic against the same days the
    /// calendar draws.
    /// </summary>
    public async Task<BriefBlockDto[]> BlocksAsync(
        int userId,
        DateOnly today,
        CancellationToken ct,
        string? lang = null)
    {
        var monthFrom = new DateOnly(today.Year, today.Month, 1);
        var monthTo = monthFrom.AddMonths(1).AddDays(-1);

        var month = await _days.ListAsync(userId, monthFrom, monthTo, ct);
        var previous = await _days.ListAsync(
            userId, monthFrom.AddMonths(-1), monthFrom.AddDays(-1), ct);

        var facts = await GatherAsync(userId, today, ct);

        // Sixty days ahead: far enough to find the next shift on a quiet
        // rota, near enough that "next" still means something.
        var soon = await _days.ListAsync(userId, today.AddDays(1), today.AddDays(60), ct);
        var next = soon.days
            .Where(day => day.shifts.Length > 0)
            .OrderBy(day => day.date)
            .FirstOrDefault();
        var nextShift = next?.shifts.FirstOrDefault();

        // What lands next, taken from the reconciliation rather than guessed,
        // so the figure here and the one on the payouts page are the same
        // figure and not two opinions about it.
        var schedule = await _reconciliation.BuildAsync(
            userId, today.AddDays(-45), today.AddDays(60), ct);

        var due = schedule.periods
            .Where(row => row.settled is null && row.due_on >= today && row.expected > 0m)
            .OrderBy(row => row.due_on)
            .FirstOrDefault();

        var ahead = new AheadFacts(
            next?.date,
            nextShift?.name,
            nextShift?.start_time,
            due is null ? facts.DaysToPayday : due.due_on.DayNumber - today.DayNumber,
            due?.expected);

        // The rest somebody counts as enough is theirs, so it is read from
        // their account rather than assumed. Eleven is the EU daily rule and
        // what an account holds until anybody says otherwise.
        var restHours = await _db.Users
            .Where(user => user.Id == userId)
            .Select(user => (double?)user.RestHours)
            .FirstOrDefaultAsync(ct) ?? RestBetweenShifts.DefaultHours;

        // The run of closed weekly goals: read here because the blocks are
        // pure and the shelf lives in the database.
        var weekCheers = await _db.GoalCheers.AsNoTracking()
            .Where(cheer => cheer.UserId == userId && cheer.Period == GoalPeriod.Week)
            .Select(cheer => cheer.PeriodFrom)
            .ToArrayAsync(ct);

        var goalStreak = GoalStreaks.Weekly(weekCheers, today);

        return BriefBlocks.Build(month, previous, today, facts, ahead, lang, restHours, goalStreak);
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
