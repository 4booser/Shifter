using System.Collections.Concurrent;
using System.Security.Cryptography;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using Shifter.Application.Features.business.Services.Interfaces;
using Shifter.Domain.Entities;
using Shifter.Infrastructure.Persistence.DbContexts;
using Shifter.Infrastructure.Repositories.Interfaces;
using Shifter.Application.Common.Text;

namespace Shifter.Application.Features.Telegram;

public sealed class TelegramOptions
{
    public const string Section = "Telegram";

    public string BotToken { get; set; } = "";

    /// <summary>Without the @; builds the t.me deep link on the account page.</summary>
    public string BotName { get; set; } = "";

    public bool Enabled => BotToken != "";
}

/// <summary>
/// The bot, long-polling getUpdates: no webhook, no public endpoint, one
/// outbound connection — the shape that works from behind any NAT and
/// needs nothing but the token. Without a token it never starts.
/// </summary>
public sealed class TelegramBotService : BackgroundService
{
    /// <summary>Six-digit link codes, five minutes each, one node.</summary>
    private static readonly ConcurrentDictionary<string, (int UserId, DateTime Expires)> LinkCodes = new();

    private readonly TelegramOptions _options;
    private readonly IHttpClientFactory _http;
    private readonly IServiceScopeFactory _scopes;
    private readonly ILogger<TelegramBotService> _logger;
    private long _offset;

    public TelegramBotService(
        IOptions<TelegramOptions> options,
        IHttpClientFactory http,
        IServiceScopeFactory scopes,
        ILogger<TelegramBotService> logger)
    {
        _options = options.Value;
        _http = http;
        _scopes = scopes;
        _logger = logger;
    }

    public bool Enabled => _options.Enabled;

    public static string IssueLinkCode(int userId)
    {
        var code = RandomNumberGenerator.GetInt32(100_000, 1_000_000).ToString();

        LinkCodes[code] = (userId, DateTime.UtcNow.AddMinutes(5));

        foreach (var (key, value) in LinkCodes)
        {
            if (value.Expires < DateTime.UtcNow) LinkCodes.TryRemove(key, out _);
        }

        return code;
    }

    protected override async Task ExecuteAsync(CancellationToken ct)
    {
        if (!_options.Enabled) return;

        _logger.LogInformation("Telegram bot polling started.");

        while (!ct.IsCancellationRequested)
        {
            try
            {
                await PollAsync(ct);
            }
            catch (Exception exception) when (exception is not OperationCanceledException)
            {
                _logger.LogWarning(exception, "Telegram poll failed; backing off.");
                await Task.Delay(TimeSpan.FromSeconds(10), ct);
            }
        }
    }

    private async Task PollAsync(CancellationToken ct)
    {
        using var client = _http.CreateClient();

        client.Timeout = TimeSpan.FromSeconds(40);

        var url = $"https://api.telegram.org/bot{_options.BotToken}/getUpdates?timeout=25&offset={_offset}";
        using var response = await client.GetAsync(url, ct);
        using var document = JsonDocument.Parse(await response.Content.ReadAsStringAsync(ct));

        if (!document.RootElement.GetProperty("ok").GetBoolean()) return;

        foreach (var update in document.RootElement.GetProperty("result").EnumerateArray())
        {
            _offset = update.GetProperty("update_id").GetInt64() + 1;

            if (!update.TryGetProperty("message", out var message)) continue;
            if (!message.TryGetProperty("text", out var textElement)) continue;

            var chatId = message.GetProperty("chat").GetProperty("id").GetInt64();
            var text = textElement.GetString() ?? "";

            var reply = await HandleAsync(chatId, text, ct);

            if (reply is not null) await SendAsync(chatId, reply, ct);
        }
    }

    private async Task<string?> HandleAsync(long chatId, string text, CancellationToken ct)
    {
        var (command, argument) = TelegramCommands.Parse(text);

        using var scope = _scopes.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ShifterDbContext>();
        var link = await db.TelegramLinks.FirstOrDefaultAsync(entry => entry.ChatId == chatId, ct);

        if (command is TelegramCommand.Link)
        {
            if (!LinkCodes.TryGetValue(argument, out var pending) || pending.Expires < DateTime.UtcNow)
                return "Код не подошёл или истёк. Возьмите свежий на странице аккаунта.";

            LinkCodes.TryRemove(argument, out _);

            if (link is null)
            {
                db.TelegramLinks.Add(new TelegramLink { UserId = pending.UserId, ChatId = chatId });
            }
            else
            {
                link.UserId = pending.UserId;
            }

            await db.SaveChangesAsync(ct);

            return "Готово — этот чат привязан к вашему Shifter. Команды: сегодня · завтра · месяц · зарплата · начал · закончил";
        }

        if (link is null)
            return "Этот чат не привязан. Откройте Аккаунт → Telegram в Shifter и пришлите мне шестизначный код.";

        var days = scope.ServiceProvider.GetRequiredService<IDayHandler>();
        var zone = ZoneOf(link);
        var today = DateOnly.FromDateTime(TimeZoneInfo.ConvertTime(DateTimeOffset.UtcNow, zone).Date);

        switch (command)
        {
            case TelegramCommand.Today:
                return await DayLineAsync(days, link.UserId, today, "Сегодня", ct);

            case TelegramCommand.Tomorrow:
                return await DayLineAsync(days, link.UserId, today.AddDays(1), "Завтра", ct);

            case TelegramCommand.Week:
            {
                // Monday-first, like every other week in the product.
                var monday = today.AddDays(-(((int)today.DayOfWeek + 6) % 7));
                var summary = await days.ListAsync(link.UserId, monday, monday.AddDays(6), ct);
                var names = new[] { "пн", "вт", "ср", "чт", "пт", "сб", "вс" };

                var lines = Enumerable.Range(0, 7).Select(offset =>
                {
                    var date = monday.AddDays(offset);
                    var shifts = summary.days.FirstOrDefault(day => day.date == date)?.shifts ?? [];
                    var text = shifts.Length == 0
                        ? "—"
                        : string.Join(", ", shifts.Select(entry =>
                            $"{entry.name} {entry.start_time}–{entry.end_time}{(entry.worked ? " ✅" : "")}"));

                    return $"{names[offset]} {date:dd.MM} · {text}";
                });

                return $"Неделя {monday:dd.MM}–{monday.AddDays(6):dd.MM}:\n"
                    + string.Join('\n', lines)
                    + $"\nИтого: {summary.days_worked} {TelegramCommands.Plural(summary.days_worked, "смена", "смены", "смен")} · {Math.Round(summary.hours)} ч";
            }

            case TelegramCommand.Month:
            {
                var from = new DateOnly(today.Year, today.Month, 1);
                var to = from.AddMonths(1).AddDays(-1);
                var summary = await days.ListAsync(link.UserId, from, to, ct);

                return $"Месяц: {summary.days_worked} {TelegramCommands.Plural(summary.days_worked, "смена", "смены", "смен")} · {Math.Round(summary.hours)} ч · {Math.Round(summary.total_earned):N0}";
            }

            case TelegramCommand.ClockIn:
                link.ClockInAtUtc = DateTime.UtcNow;
                await db.SaveChangesAsync(ct);

                return $"Засёк {TimeZoneInfo.ConvertTime(DateTimeOffset.UtcNow, zone):HH:mm}. Напишите «закончил», когда смена кончится.";

            case TelegramCommand.ClockOut:
                return await ClockOutAsync(scope.ServiceProvider, db, link, zone, today, ct);

            case TelegramCommand.Pay:
            {
                // The same NextPayout the payouts page, the brief and the
                // assistant read — a fourth reader, not a fourth opinion.
                var reconciliation = scope.ServiceProvider
                    .GetRequiredService<Shifter.Application.Features.business.Services.Interfaces.IReconciliationHandler>();
                var schedule = await reconciliation.BuildAsync(
                    link.UserId, today.AddDays(-45), today.AddDays(60), ct);
                var due = Shifter.Application.Features.business.DTOs.NextPayout.From(schedule, today);

                if (due is null)
                    return "Сверка выплат молчит: либо всё уже выплачено, либо у мест не задан день зарплаты.";

                var wait = due.due_on.DayNumber - today.DayNumber;
                // Formatted by the current culture and then patched, which is
                // two ways of being wrong about a separator. It uses the one
                // formatter this app writes numbers with.
                var amount = Figures.Count((double)due.expected);

                return wait == 0
                    ? $"Деньги должны прийти сегодня — {amount} грн ({due.location_name})."
                    : $"Ближайшие деньги {due.due_on:dd.MM} — через {wait} {TelegramCommands.Plural(wait, "день", "дня", "дней")}: {amount} грн ({due.location_name}).";
            }

            case TelegramCommand.TimeZone:
                try
                {
                    TimeZoneInfo.FindSystemTimeZoneById(argument);
                }
                catch (TimeZoneNotFoundException)
                {
                    return "Не знаю такого пояса. Пример: /tz Europe/Warsaw";
                }

                link.TimeZone = argument;
                await db.SaveChangesAsync(ct);

                return $"Часовой пояс: {argument}";

            case TelegramCommand.Help:
            case TelegramCommand.None:
            default:
                return "Понимаю: сегодня · завтра · неделя · месяц · начал · закончил · /tz <зона>";
        }
    }

    private static TimeZoneInfo ZoneOf(TelegramLink link)
    {
        try
        {
            return TimeZoneInfo.FindSystemTimeZoneById(link.TimeZone);
        }
        catch (TimeZoneNotFoundException)
        {
            return TimeZoneInfo.Utc;
        }
    }

    private static async Task<string> DayLineAsync(
        IDayHandler days, int userId, DateOnly date, string label, CancellationToken ct)
    {
        var summary = await days.ListAsync(userId, date, date, ct);
        var shifts = summary.days.FirstOrDefault()?.shifts ?? [];

        if (shifts.Length == 0) return $"{label} ({date:dd.MM}) — выходной.";

        var lines = shifts.Select(entry =>
            $"{entry.name} · {entry.start_time}–{entry.end_time}{(entry.worked ? " ✅" : "")}");

        return $"{label} ({date:dd.MM}):\n" + string.Join('\n', lines);
    }

    /// <summary>
    /// «Закончил»: the remembered clock-in and now become the actual edges
    /// of the person's one template, merged onto today. More than one
    /// template and the bot honestly refuses — it will not guess a rate.
    /// </summary>
    private async Task<string> ClockOutAsync(
        IServiceProvider services,
        ShifterDbContext db,
        TelegramLink link,
        TimeZoneInfo zone,
        DateOnly today,
        CancellationToken ct)
    {
        if (link.ClockInAtUtc is not DateTime startedUtc)
            return "Я не видел «начал» — нечего закрывать.";

        var templates = await db.Shifts
            .AsNoTracking()
            .Where(shift => shift.UserId == link.UserId && !shift.Archived)
            .ToArrayAsync(ct);

        if (templates.Length != 1)
            return "У вас не одна смена-шаблон — закройте день в приложении, чтобы выбрать ставку.";

        var commands = services.GetRequiredService<IShifterCommand>();
        var placement = DayShift.From(templates[0], worked: true);
        var startLocal = TimeZoneInfo.ConvertTime(new DateTimeOffset(startedUtc, TimeSpan.Zero), zone);
        var endLocal = TimeZoneInfo.ConvertTime(DateTimeOffset.UtcNow, zone);

        placement.ActualStart = TimeOnly.FromDateTime(startLocal.DateTime);
        placement.ActualEnd = TimeOnly.FromDateTime(endLocal.DateTime);
        placement.Shift = null;

        var day = await commands.MergeDayShiftAsync(link.UserId, today, placement, ct);

        var audit = services.GetRequiredService<Shifter.Application.Features.business.Services.DayAuditWriter>();

        await audit.WriteAsync(link.UserId, day, "telegram", ct);

        link.ClockInAtUtc = null;
        await db.SaveChangesAsync(ct);

        return $"Записал: {templates[0].Name} · {placement.ActualStart:HH\\:mm}–{placement.ActualEnd:HH\\:mm} ✅";
    }

    private async Task SendAsync(long chatId, string text, CancellationToken ct)
    {
        using var client = _http.CreateClient();
        var payload = JsonSerializer.Serialize(new { chat_id = chatId, text });

        using var content = new StringContent(payload, System.Text.Encoding.UTF8, "application/json");

        await client.PostAsync($"https://api.telegram.org/bot{_options.BotToken}/sendMessage", content, ct);
    }
}
