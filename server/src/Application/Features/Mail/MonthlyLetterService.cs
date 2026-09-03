using System.Security.Cryptography;

using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;

using Serilog;

using Shifter.Domain.Entities;
using Shifter.Infrastructure.Persistence.DbContexts;
using Shifter.Application.Common.Text;

namespace Shifter.Application.Features.Mail;

/// <summary>
/// Sends the month's letter, once, to the people who asked for it.
///
/// Once a month is the only frequency at which a letter from an app is not an
/// irritation, and it goes out after the month has ended because that is the
/// only moment its figures are final.
///
/// Nobody is written to who did not switch it on. An address given to recover
/// a password is not permission to send somebody post, and treating it as one
/// is how a product loses the address it actually needed.
/// </summary>
public sealed class MonthlyLetterService : BackgroundService
{
    /// <summary>
    /// Checked hourly rather than by cron: a process that was down at
    /// midnight on the first should still send that morning, and the stamp on
    /// each account is what keeps it to one letter either way.
    /// </summary>
    private static readonly TimeSpan Period = TimeSpan.FromHours(1);

    /// <summary>
    /// Not at midnight. A letter that arrives at 03:00 is read at 09:00 with
    /// forty others; one that arrives at 09:00 is read.
    /// </summary>
    private const int SendHour = 9;

    private readonly IServiceScopeFactory _scopes;

    public MonthlyLetterService(IServiceScopeFactory scopes) => _scopes = scopes;

    protected override async Task ExecuteAsync(CancellationToken ct)
    {
        using var timer = new PeriodicTimer(Period);

        while (await timer.WaitForNextTickAsync(ct))
        {
            try
            {
                await PassAsync(DateTime.UtcNow, ct);
            }
            catch (Exception exception) when (exception is not OperationCanceledException)
            {
                Log.Error(exception, "The monthly letter pass failed");
            }
        }
    }

    /// <summary>The month a letter sent now would be about, as "2026-08".</summary>
    public static string MonthFor(DateTime now) => now.AddMonths(-1).ToString("yyyy-MM");

    private async Task PassAsync(DateTime now, CancellationToken ct)
    {
        // The first week rather than the first day: a letter is worth sending
        // late and is never worth sending twice, and the stamp guarantees the
        // second half of that.
        if (now.Day > 7 || now.Hour < SendHour) return;

        using var scope = _scopes.CreateScope();

        var mail = scope.ServiceProvider.GetRequiredService<MailSender>();

        if (!mail.Enabled) return;

        var db = scope.ServiceProvider.GetRequiredService<ShifterDbContext>();
        var month = MonthFor(now);

        var waiting = await db.Users
            .Where(user => user.MonthlyLetter
                && user.Email != null
                && (user.MonthlyLetterSent == null || user.MonthlyLetterSent != month))
            .Take(200)
            .ToArrayAsync(ct);

        foreach (var user in waiting)
        {
            // Stamped before the send, not after. A provider that accepts the
            // letter and then times out on the response would otherwise get a
            // second one on the next pass, and a duplicate letter costs more
            // trust than a missing one.
            user.MonthlyLetterSent = month;
            user.LetterKey ??= NewKey();

            await db.SaveChangesAsync(ct);

            try
            {
                await SendAsync(db, mail, user, month, ct);
            }
            catch (Exception exception)
            {
                Log.Warning(exception, "Could not write to {User} about {Month}", user.Id, month);
            }
        }
    }

    private static async Task SendAsync(
        ShifterDbContext db, MailSender mail, User user, string month, CancellationToken ct)
    {
        var from = DateOnly.Parse($"{month}-01");
        var to = from.AddMonths(1).AddDays(-1);

        var facts = await FactsAsync(db, user.Id, from, to, ct);

        // A month with nothing in it gets no letter. "You earned nothing in
        // August" is a true sentence nobody needs posted to them.
        if (facts.Days == 0) return;

        // Formatted by whatever culture the server happens to run under and
        // then patched, and with no currency mark at all: a subject line
        // reading «сентябрь 2026: 359 396» about money. The one formatter this
        // app writes numbers with.
        string Money(decimal value) => Figures.Money(value);

        await mail.SendAsync(
            user.Email!,
            MonthlyLetter.Subject(facts, Money(facts.Earned)),
            MonthlyLetter.Html(
                facts,
                Money,
                Phrase,
                $"{mail.Origin}/letters/stop?key={user.LetterKey}"),
            ct);
    }

    private static async Task<MonthlyLetter.Facts> FactsAsync(
        ShifterDbContext db, int userId, DateOnly from, DateOnly to, CancellationToken ct)
    {
        var days = await db.Days
            .AsNoTracking()
            // Sales as well as shifts: the "not filled in" count asks about
            // both, and an uninstantiated collection reads as an empty one —
            // which would report every day as unrecorded.
            .Include(day => day.Sales)
            .Include(day => day.Shifts)
            .Where(day => day.UserId == userId
                && day.Date >= from.AddYears(-1)
                && day.Date <= to)
            .ToArrayAsync(ct);

        // Per-shift pay, which is nothing for anybody on a weekly or monthly
        // wage — theirs belongs to the period and is added below. Used on its
        // own only for the best day, where a share of a salary is not what
        // makes one day better than another anyway.
        decimal EarnedOn(Day day)
            => (day.Tips ?? 0m)
                + (day.Shifts ?? []).Where(entry => entry.Worked).Sum(entry => entry.Pay);

        // The whole figure, salaries included. A letter that told somebody on
        // a monthly wage they earned their tips and nothing else would be the
        // most memorable wrong number this app has ever sent.
        decimal Earned(Day[] range)
            => range.Sum(EarnedOn)
                + business.Services.DayHandler.PeriodSalary(range, workedOnly: true, days);

        var month = days.Where(day => day.Date >= from && day.Date <= to).ToArray();
        var worked = month.Where(day => (day.Shifts ?? []).Any(entry => entry.Worked)).ToArray();

        var previousFrom = from.AddMonths(-1);
        var lastYearFrom = from.AddYears(-1);

        decimal Total(DateOnly start, DateOnly end)
            => Earned(days.Where(day => day.Date >= start && day.Date <= end).ToArray());

        var best = worked
            .Select(day => (Date: day.Date.ToString("dd.MM"), Earned: EarnedOn(day)))
            .OrderByDescending(day => day.Earned)
            .FirstOrDefault();

        return new MonthlyLetter.Facts(
            // The letter is Russian from the subject line down; its month
            // name was whatever the server's culture said, so a box running
            // under en-US posted «September 2026» over Russian prose.
            from.ToString("MMMM yyyy", Figures.Ru),
            Earned(worked),
            worked.Sum(day => day.Tips ?? 0m),
            worked.Sum(day =>
                (day.Shifts ?? []).Where(entry => entry.Worked).Sum(entry => entry.PaidDuration.TotalHours)),
            worked.Length,
            // Zero comes back as null, so the letter leaves the comparison out
            // rather than printing a change against nothing.
            Total(lastYearFrom, lastYearFrom.AddMonths(1).AddDays(-1)) is var lastYear && lastYear > 0m
                ? lastYear
                : null,
            Total(previousFrom, from.AddDays(-1)) is var previous && previous > 0m ? previous : null,
            best.Earned > 0m ? best : null,
            // Days with a shift marked worked and nothing else recorded: no
            // tips, no revenue. The only nag the letter carries.
            worked.Count(day => day.Tips is null && day.Sales is null or []));
    }

    /// <summary>
    /// The letter's own words. Deliberately not the app's dictionary: a
    /// letter's language is chosen when it is sent and the app's is chosen in
    /// a browser, and wiring them together would make one of the two lie.
    /// </summary>
    private static string Phrase(string key) => key switch
    {
        "Worked" => "Отработано",
        "Of that, tips" => "Из них чаевые",
        "Best day" => "Лучший день",
        "Month before" => "Месяцем раньше",
        "Same month last year" => "Тот же месяц год назад",
        "Days worked but not filled in" => "Смены без записанных чаевых",
        "Stop these letters" => "Больше не присылать",
        "h" => "ч",
        _ => key,
    };

    /// <summary>
    /// Twenty-two characters of base32. An account id in the link would let
    /// anybody unsubscribe anybody by counting.
    /// </summary>
    public static string NewKey()
    {
        const string alphabet = "abcdefghjkmnpqrstuvwxyz23456789";

        return string.Concat(
            RandomNumberGenerator.GetBytes(22).Select(one => alphabet[one % alphabet.Length]));
    }
}
