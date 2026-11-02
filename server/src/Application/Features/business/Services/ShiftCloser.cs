using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Shifter.Application.Common.Time;
using Shifter.Domain.Entities;
using Shifter.Infrastructure.Persistence.DbContexts;

namespace Shifter.Application.Features.business.Services;

/// <summary>Wakes once a minute and closes the shifts that are over, so nobody has to close each one for it to count as worked.</summary>
public sealed class ShiftCloser : BackgroundService
{
    private static readonly TimeSpan Period = TimeSpan.FromMinutes(1);

    /// <summary>Further back than this is history, and history is left as it was written.</summary>
    private const int LookBackDays = 3;

    /// <summary>Sixteen hours on the clock is a forgotten shift, not a worked one: the line both clients draw.</summary>
    private static readonly TimeSpan ForgottenAfter = TimeSpan.FromHours(16);

    private readonly IServiceScopeFactory _scopes;
    private readonly AppClock _clock;
    private readonly GoalCheckQueue _goals;
    private readonly ILogger<ShiftCloser> _logger;

    public ShiftCloser(
        IServiceScopeFactory scopes,
        AppClock clock,
        GoalCheckQueue goals,
        ILogger<ShiftCloser> logger)
    {
        _scopes = scopes;
        _clock = clock;
        _goals = goals;
        _logger = logger;
    }

    protected override async Task ExecuteAsync(CancellationToken ct)
    {
        using var timer = new PeriodicTimer(Period);

        while (await timer.WaitForNextTickAsync(ct))
        {
            try
            {
                using var scope = _scopes.CreateScope();

                await PassAsync(
                    scope.ServiceProvider.GetRequiredService<ShifterDbContext>(),
                    _clock.UtcNow,
                    ct);
            }
            catch (Exception exception) when (exception is not OperationCanceledException)
            {
                _logger.LogError(exception, "Shift closer pass failed");
            }
        }
    }

    /// <summary>One sweep at the given moment, returning how many shifts it closed.</summary>
    public async Task<int> PassAsync(ShifterDbContext db, DateTime utcNow, CancellationToken ct)
    {
        DateTime now = DateTime.SpecifyKind(utcNow, DateTimeKind.Utc);
        DateOnly utcToday = DateOnly.FromDateTime(now);

        // A day wider than anybody's window on each side, so a person ahead of
        // or behind UTC is not missed. Each one's own is applied below.
        DateOnly from = utcToday.AddDays(-LookBackDays - 1);
        DateOnly to = utcToday.AddDays(2);

        var candidates = await db.DayShifts
            .AsNoTracking()
            .Where(entry => !entry.Worked
                && !entry.NeedsCover
                && entry.AutoClosedAtUtc == null
                && entry.Shift!.AutoClock
                && !entry.Shift.Archived
                && entry.Day!.Date >= from
                && entry.Day.Date <= to)
            .Select(entry => new
            {
                entry.Id,
                entry.Day!.UserId,
                entry.Day.Date,
                entry.StartTime,
                entry.EndTime,
                entry.ActualStart,
                entry.ActualEnd,
                entry.BreakMinutes,
                Place = entry.Shift!.Location,
            })
            .ToArrayAsync(ct);

        if (candidates.Length == 0) return 0;

        Dictionary<int, string> zones = await ZonesAsync(
            db, candidates.Select(entry => entry.UserId).Distinct().ToArray(), ct);

        TimeZoneInfo ZoneOf(int user) => _clock.ZoneOr(zones.GetValueOrDefault(user));

        var due = candidates
            .Where(entry =>
            {
                DateOnly today = DateOnly.FromDateTime(TimeZoneInfo.ConvertTimeFromUtc(now, ZoneOf(entry.UserId)));

                return entry.Date >= today.AddDays(-LookBackDays) && entry.Date <= today.AddDays(1);
            })
            .Select(entry => (
                Row: entry,
                Closing: ClosingOf(
                    entry.Date,
                    entry.StartTime,
                    entry.EndTime,
                    entry.ActualStart,
                    entry.ActualEnd,
                    ZoneOf(entry.UserId))))
            .Where(item => item.Closing.At <= now);

        int closed = 0;

        foreach (var day in due.GroupBy(item => (item.Row.UserId, item.Row.Date)))
        {
            int here = 0;

            foreach (var (entry, closing) in day)
            {
                DayShift held = new()
                {
                    StartTime = entry.StartTime,
                    EndTime = entry.EndTime,
                    ActualStart = entry.ActualStart,
                    ActualEnd = entry.ActualEnd,
                    BreakMinutes = entry.BreakMinutes,
                };

                // The place's rule on the hours the close is about to write.
                // Left to the next save it would come in with a tip typed the
                // morning after, and the pay would move for no reason anyone
                // could see. What it gave the plan goes with the plan, the way
                // a save moving the hours gives it back.
                int rest = new DayShift
                {
                    StartTime = entry.StartTime,
                    EndTime = entry.EndTime,
                    ActualStart = entry.ActualStart ?? entry.StartTime,
                    ActualEnd = entry.ActualEnd ?? closing.End ?? entry.EndTime,
                    BreakMinutes = held.OwnBreak(entry.Place),
                }.BreakUnder(entry.Place);

                here += await CloseAsync(db, entry.Id, entry.BreakMinutes, rest, closing.End, now, ct);
            }

            if (here == 0) continue;

            closed += here;

            // A close moves earned money just as a save does, so it can cross
            // a goal too. Asked for before the audit below can fail: the shift
            // is closed either way.
            _goals.Enqueue(day.Key.UserId, day.Key.Date);

            Day written = await db.Days
                .AsNoTracking()
                .Include(row => row.Shifts)
                .Include(row => row.Sales)
                .FirstAsync(row => row.UserId == day.Key.UserId && row.Date == day.Key.Date, ct);

            DayAudit line = DayAuditWriter.Line(day.Key.UserId, written, "auto");

            line.At = now;
            db.DayAudits.Add(line);

            await db.SaveChangesAsync(ct);
        }

        return closed;
    }

    /// <summary>When a placement closes, and the end to write where that is not the plan's own.</summary>
    // A start past the plan's close leaves no plan to end the shift, and the
    // shared rule would give 18:00 on a plan to 17:00 the wrapped close 23 hours
    // on. It stops at the limit instead, the moment and the end a clock would
    // record, so the server and a client asleep through it write the same thing.
    private static (DateTime At, TimeOnly? End) ClosingOf(
        DateOnly date,
        TimeOnly start,
        TimeOnly end,
        TimeOnly? actualStart,
        TimeOnly? actualEnd,
        TimeZoneInfo zone)
    {
        if (ShiftWindow.StartedAfterPlan(date, start, end, actualStart, actualEnd) is DateTime late)
        {
            DateTime limit = AppClock.ToUtc(late, zone) + ForgottenAfter;

            return (limit, TimeOnly.FromDateTime(TimeZoneInfo.ConvertTimeFromUtc(limit, zone)));
        }

        return (AppClock.ToUtc(ShiftWindow.Of(date, start, end, actualStart, actualEnd).Closes, zone), null);
    }

    /// <summary>Closes one shift, as long as nobody got there first.</summary>
    // One conditional write rather than a tracked edit: a save landing between
    // the read above and this line may have recorded the real times, and the
    // condition is what stops the plan going over the top of them. Day.Version
    // stays out of it on purpose, or the server would hand a 409 to a panel
    // nobody touched. A break other than the one read came from that same save
    // and can only be raised.
    private static Task<int> CloseAsync(
        ShifterDbContext db,
        int id,
        int read,
        int rest,
        TimeOnly? end,
        DateTime now,
        CancellationToken ct)
        => db.DayShifts
            .Where(row => row.Id == id
                && !row.Worked
                && !row.NeedsCover
                && row.AutoClosedAtUtc == null)
            .ExecuteUpdateAsync(
                setters => setters
                    .SetProperty(row => row.Worked, true)
                    .SetProperty(row => row.ActualStart, row => row.ActualStart ?? row.StartTime)
                    .SetProperty(row => row.ActualEnd, row => row.ActualEnd ?? end ?? row.EndTime)
                    .SetProperty(
                        row => row.BreakMinutes,
                        row => row.BreakMinutes == read || row.BreakMinutes < rest ? rest : row.BreakMinutes)
                    .SetProperty(row => row.AutoClosedAtUtc, (DateTime?)now),
                ct);

    /// <summary>Where each person said they are: the newest phone, else a browser, else the Telegram chat.</summary>
    private static async Task<Dictionary<int, string>> ZonesAsync(
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
