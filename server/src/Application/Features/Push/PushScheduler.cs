using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Shifter.Application.Features.business.Services.Interfaces;
using Shifter.Domain.Entities;
using Shifter.Infrastructure.Persistence.DbContexts;

namespace Shifter.Application.Features.Push;

/// <summary>
/// Wakes once a minute and asks, for every subscribed device, whether its
/// local clock has just crossed its chosen time. Two nudges can result:
/// tomorrow's shift, and yesterday's unclosed day. Each is stamped with the
/// local date it went out, so however often the loop runs — or however long
/// the process was down — a device hears about a given day exactly once.
/// </summary>
public sealed class PushScheduler : BackgroundService
{
    private static readonly TimeSpan Period = TimeSpan.FromMinutes(1);

    /// <summary>How far past the chosen minute a nudge is still worth sending.</summary>
    private static readonly TimeSpan Window = TimeSpan.FromMinutes(30);

    /// <summary>Payday news comes mid-morning, whatever the evening setting says.</summary>
    private static readonly TimeOnly PaydayAt = new(10, 0);

    private readonly IServiceScopeFactory _scopes;
    private readonly PushSender _sender;
    private readonly ILogger<PushScheduler> _logger;

    public PushScheduler(IServiceScopeFactory scopes, PushSender sender, ILogger<PushScheduler> logger)
    {
        _scopes = scopes;
        _sender = sender;
        _logger = logger;
    }

    protected override async Task ExecuteAsync(CancellationToken ct)
    {
        if (!_sender.Enabled) return;

        using var timer = new PeriodicTimer(Period);

        while (await timer.WaitForNextTickAsync(ct))
        {
            try
            {
                await PassAsync(ct);
            }
            catch (Exception exception) when (exception is not OperationCanceledException)
            {
                _logger.LogError(exception, "Push scheduler pass failed");
            }
        }
    }

    private async Task PassAsync(CancellationToken ct)
    {
        using var scope = _scopes.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ShifterDbContext>();

        var subscriptions = await db.PushSubscriptions
            .Where(s => s.NotifyTomorrow || s.NotifyUnclosed || s.NotifyPayday || s.NotifyDigest)
            .ToListAsync(ct);

        foreach (var subscription in subscriptions)
        {
            TimeZoneInfo zone;

            try
            {
                zone = TimeZoneInfo.FindSystemTimeZoneById(subscription.TimeZone);
            }
            catch (TimeZoneNotFoundException)
            {
                continue;
            }

            var localNow = TimeZoneInfo.ConvertTime(DateTimeOffset.UtcNow, zone);
            var today = DateOnly.FromDateTime(localNow.Date);

            if (!TimeOnly.TryParse(subscription.NotifyAt, out var at)) continue;

            var sinceChosen = localNow.TimeOfDay - at.ToTimeSpan();
            var chosenOpen = sinceChosen >= TimeSpan.Zero && sinceChosen <= Window;

            var sinceMorning = localNow.TimeOfDay - PaydayAt.ToTimeSpan();
            var morningOpen = sinceMorning >= TimeSpan.Zero && sinceMorning <= Window;

            var dead = false;

            // The evening pair, at the chosen minute: a nudge at 3 a.m. helps
            // nobody, hence the window.
            if (chosenOpen && subscription.NotifyTomorrow && subscription.TomorrowSentOn != today)
            {
                subscription.TomorrowSentOn = today;
                dead = !await SendTomorrowAsync(db, subscription, today.AddDays(1), ct);
            }

            if (!dead && chosenOpen && subscription.NotifyUnclosed && subscription.UnclosedSentOn != today)
            {
                subscription.UnclosedSentOn = today;
                dead = !await SendUnclosedAsync(db, subscription, today.AddDays(-1), ct);
            }

            if (!dead && morningOpen && subscription.NotifyPayday && subscription.PaydaySentOn != today)
            {
                subscription.PaydaySentOn = today;
                dead = !await SendPaydayAsync(scope.ServiceProvider, subscription, today, ct);
            }

            if (!dead
                && chosenOpen
                && subscription.NotifyDigest
                && localNow.DayOfWeek == DayOfWeek.Sunday
                && subscription.DigestSentOn != today)
            {
                subscription.DigestSentOn = today;
                dead = !await SendDigestAsync(scope.ServiceProvider, subscription, today, ct);
            }

            if (dead) db.PushSubscriptions.Remove(subscription);
        }

        await db.SaveChangesAsync(ct);
    }

    /// <summary>True while the subscription is alive; a quiet day also counts.</summary>
    private async Task<bool> SendTomorrowAsync(
        ShifterDbContext db,
        PushSubscription subscription,
        DateOnly tomorrow,
        CancellationToken ct)
    {
        var shifts = await db.DayShifts
            .Where(entry => entry.Day!.UserId == subscription.UserId && entry.Day.Date == tomorrow && !entry.Worked)
            .Include(entry => entry.Shift)
            .OrderBy(entry => entry.StartTime)
            .ToListAsync(ct);

        if (shifts.Count == 0) return true;

        var first = shifts[0];
        var name = first.Shift?.Name ?? "";
        var times = $"{first.StartTime:HH\\:mm}–{first.EndTime:HH\\:mm}";

        var (title, body) = subscription.Language switch
        {
            "ru" => ("Завтра смена", $"{name} · {times}"),
            "uk" => ("Завтра зміна", $"{name} · {times}"),
            _ => ("You work tomorrow", $"{name} · {times}"),
        };

        if (shifts.Count > 1)
        {
            body += subscription.Language switch
            {
                "ru" => $" и ещё {shifts.Count - 1}",
                "uk" => $" і ще {shifts.Count - 1}",
                _ => $" and {shifts.Count - 1} more",
            };
        }

        return await _sender.SendAsync(subscription, title, body, "/dashboard");
    }

    /// <summary>Money landing today, summed across places due on the date.</summary>
    private async Task<bool> SendPaydayAsync(
        IServiceProvider services,
        PushSubscription subscription,
        DateOnly today,
        CancellationToken ct)
    {
        var reconciliation = services.GetRequiredService<IReconciliationHandler>();
        var schedule = await reconciliation.BuildAsync(
            subscription.UserId, today.AddDays(-31), today.AddDays(1), ct);

        var due = schedule.periods
            .Where(row => row.due_on == today && row.paid == 0 && row.expected > 0)
            .ToArray();

        if (due.Length == 0) return true;

        var amount = Math.Round(due.Sum(row => row.expected));
        var names = string.Join(", ", due.Select(row => row.location_name).Distinct());

        var (title, body) = subscription.Language switch
        {
            "ru" => ("Сегодня зарплата", $"{names}: ~{amount:N0}. Придут деньги — запишите выплату."),
            "uk" => ("Сьогодні зарплата", $"{names}: ~{amount:N0}. Прийдуть гроші — запишіть виплату."),
            _ => ("Payday", $"{names}: ~{amount:N0}. When it lands, record the payout."),
        };

        return await _sender.SendAsync(subscription, title, body, "/payouts");
    }

    /// <summary>The finished week in one line, with last week as the yardstick.</summary>
    private async Task<bool> SendDigestAsync(
        IServiceProvider services,
        PushSubscription subscription,
        DateOnly sunday,
        CancellationToken ct)
    {
        var daysHandler = services.GetRequiredService<IDayHandler>();
        var monday = sunday.AddDays(-6);
        var week = await daysHandler.ListAsync(subscription.UserId, monday, sunday, ct);

        if (week.total_earned <= 0 && week.days_worked == 0) return true;

        var before = await daysHandler.ListAsync(
            subscription.UserId, monday.AddDays(-7), sunday.AddDays(-7), ct);

        var trend = "";

        if (before.total_earned > 0)
        {
            var change = (double)((week.total_earned / before.total_earned - 1m) * 100m);

            trend = change >= 1 ? $" (+{change:F0}%)" : change <= -1 ? $" ({change:F0}%)" : "";
        }

        var earned = $"{Math.Round(week.total_earned):N0}";
        var hours = Math.Round(week.hours);

        var (title, body) = subscription.Language switch
        {
            "ru" => ("Итог недели", $"{week.days_worked} смен · {hours} ч · {earned}{trend}"),
            "uk" => ("Підсумок тижня", $"{week.days_worked} змін · {hours} год · {earned}{trend}"),
            _ => ("Your week", $"{week.days_worked} shifts · {hours} h · {earned}{trend}"),
        };

        return await _sender.SendAsync(subscription, title, body, "/stats");
    }

    private async Task<bool> SendUnclosedAsync(
        ShifterDbContext db,
        PushSubscription subscription,
        DateOnly yesterday,
        CancellationToken ct)
    {
        var day = await db.Days
            .Include(entry => entry.Shifts)
            .Include(entry => entry.Sales)
            .FirstOrDefaultAsync(
                entry => entry.UserId == subscription.UserId && entry.Date == yesterday,
                ct);

        var worked = day?.Shifts?.Any(entry => entry.Worked) == true;
        var closed = (day?.Tips ?? 0) != 0 || (day?.TipsCash ?? 0) != 0 || day?.Sales is { Count: > 0 };

        if (!worked || closed) return true;

        var (title, body) = subscription.Language switch
        {
            "ru" => ("Вчерашний день не закрыт", "Смена записана, а чаевых и продаж нет. Впишите, пока помните."),
            "uk" => ("Вчорашній день не закрито", "Зміну записано, а чайових і продажів немає. Впишіть, поки пам’ятаєте."),
            _ => ("Yesterday is still open", "The shift is there, but no tips or sales. Add them while you remember."),
        };

        return await _sender.SendAsync(subscription, title, body, "/dashboard");
    }
}
