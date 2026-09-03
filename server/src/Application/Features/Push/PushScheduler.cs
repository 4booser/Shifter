using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Shifter.Application.Features.business.Services;
using Shifter.Application.Features.business.Services.Interfaces;
using Shifter.Domain.Entities;
using Shifter.Infrastructure.Persistence.DbContexts;
using Shifter.Application.Common.Text;

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
        // The browser channel can be switched off and the phones still work:
        // they are separate channels that fail separately, which is the whole
        // reason the tokens live in their own table.

        using var timer = new PeriodicTimer(Period);

        while (await timer.WaitForNextTickAsync(ct))
        {
            try
            {
                if (_sender.Enabled) await PassAsync(ct);

                await PhonesAsync(ct);
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
            .Where(s => s.NotifyTomorrow || s.NotifyUnclosed || s.NotifyPayday || s.NotifyDigest
                || s.NotifyOvertime || s.NotifyDocuments)
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

            // The overtime guard rides the evening slot too: a warning about
            // this week is only useful while the week can still be changed.
            if (!dead
                && chosenOpen
                && subscription.NotifyOvertime
                && subscription.OvertimeSentOn != today
                && localNow.DayOfWeek is not DayOfWeek.Sunday)
            {
                subscription.OvertimeSentOn = today;
                dead = !await SendOvertimeAsync(scope.ServiceProvider, subscription, today, ct);
            }

            // The morning slot, because renewing a document is a daytime
            // errand: a clinic that closes at five is no use to somebody told
            // about it at nine in the evening.
            if (!dead
                && morningOpen
                && subscription.NotifyDocuments
                && subscription.DocumentsSentOn != today)
            {
                subscription.DocumentsSentOn = today;
                dead = !await SendDocumentsAsync(scope.ServiceProvider, subscription, today, ct);
            }

            if (dead) db.PushSubscriptions.Remove(subscription);
        }

        await db.SaveChangesAsync(ct);
    }

    /// <summary>
    /// The same pass, for phones.
    ///
    /// It exists separately because the two channels carry different things: a
    /// browser subscription belongs to a profile and knows six kinds of nudge,
    /// a device token belongs to a person's pocket and wants the two that are
    /// worth unlocking a phone for. And because until this, a person with only
    /// the app — which is most of them — got neither of those two at all: the
    /// whole scheduler was keyed on browser subscriptions, so a phone with no
    /// browser beside it was never told about tomorrow's shift or today's
    /// wage.
    /// </summary>
    private async Task PhonesAsync(CancellationToken ct)
    {
        using var scope = _scopes.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ShifterDbContext>();
        var phones = scope.ServiceProvider.GetRequiredService<ExpoPushSender>();

        var devices = await db.DeviceTokens
            .Where(device => device.NotifyTomorrow || device.NotifyPayday || device.NotifyUnclosed)
            .ToListAsync(ct);

        foreach (var device in devices)
        {
            TimeZoneInfo zone;

            try
            {
                zone = TimeZoneInfo.FindSystemTimeZoneById(device.TimeZone);
            }
            catch (TimeZoneNotFoundException)
            {
                continue;
            }

            var localNow = TimeZoneInfo.ConvertTime(DateTimeOffset.UtcNow, zone);
            var today = DateOnly.FromDateTime(localNow.Date);

            if (!TimeOnly.TryParse(device.NotifyAt, out var at)) continue;

            var sinceChosen = localNow.TimeOfDay - at.ToTimeSpan();
            var chosenOpen = sinceChosen >= TimeSpan.Zero && sinceChosen <= Window;

            var sinceMorning = localNow.TimeOfDay - PaydayAt.ToTimeSpan();
            var morningOpen = sinceMorning >= TimeSpan.Zero && sinceMorning <= Window;

            var dead = false;

            if (chosenOpen && device.NotifyTomorrow && device.TomorrowSentOn != today)
            {
                device.TomorrowSentOn = today;
                dead = !await PhoneTomorrowAsync(db, phones, device, today.AddDays(1), ct);
            }

            if (!dead && morningOpen && device.NotifyPayday && device.PaydaySentOn != today)
            {
                device.PaydaySentOn = today;
                dead = !await PhonePaydayAsync(scope.ServiceProvider, phones, device, today, ct);
            }

            if (!dead && chosenOpen && device.NotifyUnclosed && device.UnclosedSentOn != today)
            {
                device.UnclosedSentOn = today;
                dead = !await PhoneUnclosedAsync(db, phones, device, today.AddDays(-1), ct);
            }

            if (dead) db.DeviceTokens.Remove(device);
        }

        await db.SaveChangesAsync(ct);
    }

    /// <summary>True while the token is alive; a quiet day also counts.</summary>
    private async Task<bool> PhoneTomorrowAsync(
        ShifterDbContext db,
        ExpoPushSender phones,
        DeviceToken device,
        DateOnly tomorrow,
        CancellationToken ct)
    {
        var shifts = await db.DayShifts
            .Where(entry => entry.Day!.UserId == device.UserId && entry.Day.Date == tomorrow && !entry.Worked)
            .Include(entry => entry.Shift)
            .OrderBy(entry => entry.StartTime)
            .ToListAsync(ct);

        if (shifts.Count == 0) return true;

        var first = shifts[0];
        var name = first.Shift?.Name ?? "";
        var times = $"{first.StartTime:HH\\:mm}–{first.EndTime:HH\\:mm}";

        var (title, body) = device.Language switch
        {
            "ru" => ("Завтра смена", $"{name} · {times}"),
            "uk" => ("Завтра зміна", $"{name} · {times}"),
            _ => ("You work tomorrow", $"{name} · {times}"),
        };

        if (shifts.Count > 1)
        {
            body += device.Language switch
            {
                "ru" => $" и ещё {shifts.Count - 1}",
                "uk" => $" і ще {shifts.Count - 1}",
                _ => $" and {shifts.Count - 1} more",
            };
        }

        // The category is what puts "start the shift" on the lock screen. A
        // phone that never registered it simply gets the notification without
        // buttons, which is exactly what it got before.
        return await phones.SendAsync(device.Token, title, body, "/", ct, "shift");
    }

    /// <summary>Money landing today, for a phone.</summary>
    private async Task<bool> PhonePaydayAsync(
        IServiceProvider services,
        ExpoPushSender phones,
        DeviceToken device,
        DateOnly today,
        CancellationToken ct)
    {
        var reconciliation = services.GetRequiredService<IReconciliationHandler>();
        var schedule = await reconciliation.BuildAsync(
            device.UserId, today.AddDays(-31), today.AddDays(1), ct);

        var due = schedule.periods
            .Where(row => row.due_on == today && row.paid == 0 && row.expected > 0)
            .ToArray();

        if (due.Length == 0) return true;

        // Formatted by whatever culture the process runs under and with no
        // currency mark: a phone read «~19,095» about wages, where a comma is
        // a decimal point half the world over. The one formatter this
        // application writes money with.
        var amount = Figures.Money(due.Sum(row => row.expected));
        var names = string.Join(", ", due.Select(row => row.location_name).Distinct());

        var (title, body) = device.Language switch
        {
            "ru" => ("Сегодня зарплата", $"{names}: ~{amount}. Придут деньги — запишите выплату."),
            "uk" => ("Сьогодні зарплата", $"{names}: ~{amount}. Прийдуть гроші — запишіть виплату."),
            _ => ("Payday", $"{names}: ~{amount}. When it lands, record the payout."),
        };

        return await phones.SendAsync(device.Token, title, body, "/payouts", ct, "payday");
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

        // Formatted by whatever culture the process runs under and with no
        // currency mark: a phone read «~19,095» about wages, where a comma is
        // a decimal point half the world over. The one formatter this
        // application writes money with.
        var amount = Figures.Money(due.Sum(row => row.expected));
        var names = string.Join(", ", due.Select(row => row.location_name).Distinct());

        var (title, body) = subscription.Language switch
        {
            "ru" => ("Сегодня зарплата", $"{names}: ~{amount}. Придут деньги — запишите выплату."),
            "uk" => ("Сьогодні зарплата", $"{names}: ~{amount}. Прийдуть гроші — запишіть виплату."),
            _ => ("Payday", $"{names}: ~{amount}. When it lands, record the payout."),
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

        var earned = Figures.Money(week.total_earned);
        var hours = Math.Round(week.hours);

        var (title, body) = subscription.Language switch
        {
            // A week with one shift in it said «1 смен» in a notification.
            "ru" => ("Итог недели", $"{week.days_worked} {Telegram.TelegramCommands.Plural(week.days_worked, "смена", "смены", "смен")} · {hours} ч · {earned}{trend}"),
            "uk" => ("Підсумок тижня", $"{week.days_worked} {Telegram.TelegramCommands.Plural(week.days_worked, "зміна", "зміни", "змін")} · {hours} год · {earned}{trend}"),
            _ => ("Your week", $"{week.days_worked} shifts · {hours} h · {earned}{trend}"),
        };

        return await _sender.SendAsync(subscription, title, body, "/stats");
    }

    /// <summary>
    /// "38 of 40 hours this week." Silent until the last fifth of the
    /// threshold, silent again once the line is behind — a warning nobody
    /// can act on is just noise, and this one has to be actionable.
    /// </summary>
    private async Task<bool> SendOvertimeAsync(
        IServiceProvider services,
        PushSubscription subscription,
        DateOnly today,
        CancellationToken ct)
    {
        var daysHandler = services.GetRequiredService<IDayHandler>();
        var monday = today.AddDays(-(((int)today.DayOfWeek + 6) % 7));
        var week = await daysHandler.ListAsync(subscription.UserId, monday, today, ct);

        // The threshold belongs to the place that is being worked most this
        // week; with no places configured there is nothing to guard.
        var busiest = week.by_location.OrderByDescending(place => place.hours).FirstOrDefault();

        if (busiest is null || busiest.hours <= 0) return true;

        var locations = services.GetRequiredService<Shifter.Infrastructure.Repositories.Interfaces.IShifterQuery>();
        var places = await locations.GetLocationsAsync(subscription.UserId, true, ct);
        var place = places.FirstOrDefault(row => row.Id == busiest.location_id);
        var threshold = place?.OvertimeWeeklyHours ?? 40;

        if (OvertimeWatch.Judge(week.hours, threshold) != OvertimeWatch.Verdict.Approaching) return true;

        var worked = Math.Round(week.hours);
        var (title, body) = subscription.Language switch
        {
            "ru" => ("Неделя подходит к порогу", $"{worked} из {threshold:0} ч. Дальше идут переработки."),
            "uk" => ("Тиждень підходить до порогу", $"{worked} із {threshold:0} год. Далі йдуть переробки."),
            _ => ("Close to the weekly limit", $"{worked} of {threshold:0} h. Past that it is overtime."),
        };

        return await _sender.SendAsync(subscription, title, body, "/stats");
    }

    /// <summary>
    /// A paper running out. Sent once when it enters the month, once when it
    /// enters the week, and then daily once it has actually expired — because
    /// past that point every single shift is at risk, and a warning that goes
    /// quiet is a warning that failed.
    /// </summary>
    private async Task<bool> SendDocumentsAsync(
        IServiceProvider services,
        PushSubscription subscription,
        DateOnly today,
        CancellationToken ct)
    {
        var documents = services.GetRequiredService<DocumentHandler>();
        var mine = await documents.ListAsync(subscription.UserId, ct);

        var worst = mine
            .Where(document => document.state is "expired" or "urgent" or "soon")
            .OrderBy(document => document.days_left)
            .FirstOrDefault();

        if (worst is null) return true;

        // Only on the days the state actually changes, or every day once it is
        // gone. Otherwise this is a daily nag for a month.
        bool sayIt = worst.state == "expired"
            || worst.days_left == DocumentRules.WarnDays
            || worst.days_left == DocumentRules.UrgentDays;

        if (!sayIt) return true;

        var (title, body) = (worst.state, subscription.Language) switch
        {
            ("expired", "ru") => ("Документ просрочен", $"«{worst.name}» закончился. На смену могут не пустить."),
            ("expired", "uk") => ("Документ прострочено", $"«{worst.name}» скінчився. На зміну можуть не пустити."),
            ("expired", _) => ("A document has expired", $"“{worst.name}” has run out. It can cost you a shift."),
            (_, "ru") => ("Документ скоро закончится", $"«{worst.name}» — осталось {worst.days_left} дн."),
            (_, "uk") => ("Документ скоро скінчиться", $"«{worst.name}» — лишилося {worst.days_left} дн."),
            (_, _) => ("A document runs out soon", $"“{worst.name}” — {worst.days_left} days left."),
        };

        return await _sender.SendAsync(subscription, title, body, "/account");
    }

    /// <summary>The web nudge's phone twin — and it opens the day itself.</summary>
    private async Task<bool> PhoneUnclosedAsync(
        ShifterDbContext db,
        ExpoPushSender phones,
        DeviceToken device,
        DateOnly yesterday,
        CancellationToken ct)
    {
        var day = await db.Days
            .Include(entry => entry.Shifts)
            .Include(entry => entry.Sales)
            .FirstOrDefaultAsync(
                entry => entry.UserId == device.UserId && entry.Date == yesterday,
                ct);

        var worked = day?.Shifts?.Any(entry => entry.Worked) == true;
        var closed = (day?.Tips ?? 0) != 0 || (day?.TipsCash ?? 0) != 0 || day?.Sales is { Count: > 0 };

        if (!worked || closed) return true;

        var (title, body) = device.Language switch
        {
            "ru" => ("Вчерашний день не закрыт", "Смена записана, а чаевых и продаж нет. Впишите, пока помните."),
            "uk" => ("Вчорашній день не закрито", "Зміну записано, а чайових і продажів немає. Впишіть, поки пам’ятаєте."),
            _ => ("Yesterday is still open", "The shift is there, but no tips or sales. Add them while you remember."),
        };

        return await phones.SendAsync(device.Token, title, body, $"/day/{yesterday:yyyy-MM-dd}", ct);
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
