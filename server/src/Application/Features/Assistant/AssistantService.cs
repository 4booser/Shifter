using Microsoft.EntityFrameworkCore;

using Shifter.Application.Common.Exceptions;
using Shifter.Application.Features.business.DTOs;
using Shifter.Application.Features.business.Services.Interfaces;
using Shifter.Domain.Entities;
using Shifter.Infrastructure.Persistence.DbContexts;

namespace Shifter.Application.Features.Assistant;

/// <summary>
/// The assistant. Facts come from the same handler the calendar uses, so a
/// figure it quotes and a figure on screen can never disagree; the model, when
/// there is one, only chooses the words. Everything works without a key —
/// worse prose, identical numbers.
/// </summary>
public sealed class AssistantService
{
    /// <summary>Long enough to hold a conversation, short enough to load at once.</summary>
    private const int ThreadLength = 60;

    /// <summary>A question people can type but nobody should be able to post.</summary>
    private const int QuestionMax = 500;

    private readonly ShifterDbContext _db;
    private readonly IDayHandler _days;
    private readonly GeminiAssistantClient _model;

    public AssistantService(ShifterDbContext db, IDayHandler days, GeminiAssistantClient model)
    {
        _db = db;
        _days = days;
        _model = model;
    }

    public async Task<AssistantMessage[]> ThreadAsync(int userId, CancellationToken ct)
    {
        var rows = await _db.AssistantMessages
            .AsNoTracking()
            .Where(message => message.UserId == userId)
            .OrderByDescending(message => message.CreatedAt)
            .ThenByDescending(message => message.Id)
            .Take(ThreadLength)
            .ToArrayAsync(ct);

        // Read newest-first for the query, shown oldest-first like a chat.
        return rows.Reverse().ToArray();
    }

    public async Task<AssistantMessage> AskAsync(
        int userId, string question, DateOnly from, DateOnly to, DateOnly today, CancellationToken ct)
    {
        var trimmed = (question ?? "").Trim();

        if (trimmed.Length == 0) throw new ValidationException("Спросите что-нибудь.");
        if (trimmed.Length > QuestionMax) throw new ValidationException("Вопрос слишком длинный.");

        _db.AssistantMessages.Add(new AssistantMessage
        {
            UserId = userId,
            Role = "user",
            Text = trimmed,
        });

        // The question can name its own period; the client's range is only
        // what to fall back on when it does not.
        var (asked, until) = AssistantPeriod.Of(trimmed, today, from, to);
        var facts = await FactsAsync(userId, asked, until, ct, today);
        var local = AssistantWriter.Answer(trimmed, facts);
        var dressed = await _model.AnswerAsync(trimmed, facts, local, ct);

        var answer = new AssistantMessage
        {
            UserId = userId,
            Role = "assistant",
            Text = dressed ?? local,
            Source = dressed is null ? "local" : "model",
            // A hair later, so a thread ordered by time never shows the answer
            // above the question that caused it.
            CreatedAt = DateTime.UtcNow.AddMilliseconds(1),
        };

        _db.AssistantMessages.Add(answer);
        await _db.SaveChangesAsync(ct);

        return answer;
    }

    public async Task ClearAsync(int userId, CancellationToken ct)
        => await _db.AssistantMessages.Where(message => message.UserId == userId).ExecuteDeleteAsync(ct);

    /// <summary>The written-out period: our figures, and prose around them.</summary>
    public async Task<AssistantReportDto> ReportAsync(
        int userId, DateOnly from, DateOnly to, CancellationToken ct)
    {
        if (to < from) (from, to) = (to, from);

        if (to.DayNumber - from.DayNumber > 400)
            throw new ValidationException("Больше года за раз мы не разбираем.");

        var facts = await FactsAsync(userId, from, to, ct);
        var (summary, paragraphs) = AssistantWriter.Report(facts);
        var dressed = await _model.ReportAsync(facts, string.Join("\n\n", paragraphs), ct);

        var prose = dressed is null
            ? paragraphs
            : dressed.Split("\n\n", StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);

        return new AssistantReportDto(
            facts.Period,
            $"{from:yyyy-MM-dd}",
            $"{to:yyyy-MM-dd}",
            summary,
            prose,
            [
                new AssistantStatDto("Заработано", AssistantWriter.Money(facts.Earned), null),
                new AssistantStatDto("Смен", $"{facts.Shifts}", null),
                new AssistantStatDto("Часов", $"{Math.Round(facts.Hours)}", null),
                new AssistantStatDto("В час", AssistantWriter.Money(facts.PerHour), null),
                .. facts.TipsEarned > 0
                    ? new[] { new AssistantStatDto("Чаевые", AssistantWriter.Money(facts.TipsEarned), null) }
                    : [],
                .. facts.RevenueEarned > 0
                    ? new[] { new AssistantStatDto("Процент", AssistantWriter.Money(facts.RevenueEarned), null) }
                    : [],
                .. facts.Tax > 0
                    ? new[] { new AssistantStatDto("На руки", AssistantWriter.Money(facts.Net), null) }
                    : [],
            ],
            dressed is null ? "local" : "model");
    }

    /// <summary>What the assistant would like to ask, newest blanks first.</summary>
    public async Task<AssistantGaps.Gap[]> GapsAsync(int userId, DateOnly today, CancellationToken ct)
    {
        // Six weeks back: far enough to catch a forgotten fortnight, near
        // enough that somebody still remembers the answer.
        var range = await _days.ListAsync(userId, today.AddDays(-42), today, ct);

        return AssistantGaps.Find(range.days, today);
    }

    /// <summary>
    /// Writes one answer back where it belongs. The day is re-read and sent
    /// whole, so answering a question about tips cannot quietly drop the
    /// shifts that were already on it.
    /// </summary>
    public async Task AnswerGapAsync(
        int userId, string kind, DateOnly date, int? shiftId, decimal value, CancellationToken ct)
    {
        if (value < 0m) throw new ValidationException("Сумма не может быть отрицательной.");

        var range = await _days.ListAsync(userId, date, date, ct);
        var day = range.days.FirstOrDefault(entry => entry.date == date)
            ?? throw new NotFoundException("Такого дня нет.");

        var shifts = day.shifts.Select(shift => new DayShiftSaveDto(
            shift.shift_id,
            shift.worked,
            shift.needs_cover,
            shift.actual_start,
            shift.actual_end,
            shift.break_minutes,
            kind == "revenue" && shift.shift_id == shiftId ? value : shift.revenue)).ToArray();

        var save = new DaySaveDto(
            shifts,
            day.sales.Select(sale => new DaySaleSaveDto(sale.sales_id, sale.quantity)).ToArray(),
            kind == "tips" ? value : day.tips,
            day.tips_cash,
            day.deductions,
            day.note,
            day.colour,
            kind == "pool" ? value : day.tip_pool);

        await _days.SaveAsync(save, userId, date, ct);
    }

    private async Task<AssistantFacts> FactsAsync(
        int userId, DateOnly from, DateOnly to, CancellationToken ct, DateOnly? today = null)
    {
        var range = await _days.ListAsync(userId, from, to, ct);

        // The same span again, immediately before: "more than last time" is
        // the comparison people make, and it needs equal lengths to be fair.
        var span = to.DayNumber - from.DayNumber + 1;
        var previous = await _days.ListAsync(userId, from.AddDays(-span), from.AddDays(-1), ct);

        var worked = range.days.Where(day => day.shifts.Any(shift => shift.worked)).ToArray();
        var best = worked.OrderByDescending(day => day.earned).FirstOrDefault();

        var byWeekday = worked
            .GroupBy(day => day.date.DayOfWeek)
            .OrderByDescending(group => group.Count())
            .FirstOrDefault();

        var longest = range.days
            .SelectMany(day => day.shifts.Where(shift => shift.worked))
            .Select(shift => shift.hours)
            .DefaultIfEmpty(0)
            .Max();

        return new AssistantFacts(
            $"{from:yyyy-MM-dd}",
            $"{to:yyyy-MM-dd}",
            Name(from, to, today),
            range.total_earned,
            range.planned_earned,
            range.net_earned,
            range.tax,
            range.days_worked,
            range.hours,
            range.hours <= 0 ? 0m : Math.Round(range.total_earned / (decimal)range.hours, 2),
            range.shifts_earned,
            range.revenue_earned,
            range.revenue_counted,
            range.tips_earned,
            range.sales_earned,
            range.period_earned,
            range.overtime_earned,
            range.premium_earned,
            range.tip_out,
            range.deductions,
            range.overtime_hours,
            range.night_hours,
            best?.earned ?? 0m,
            best is null ? null : $"{best.date:yyyy-MM-dd}",
            byWeekday is null ? null : Weekday(byWeekday.Key),
            (decimal)longest,
            range.days.Count(day => day.shifts.Length == 0),
            range.by_location
                // Shifts with no place land in a synthetic bucket the totals
                // name in English; the assistant writes Russian prose and
                // must not read "No location" out loud.
                .Select(place => new AssistantPlace(
                    place.location_id == 0 ? "без места" : place.name,
                    place.hours,
                    place.earned))
                .ToArray(),
            previous.total_earned,
            range.currencies);
    }

    /// <summary>What to call this span in a sentence.</summary>
    private static string Name(DateOnly from, DateOnly to, DateOnly? today = null)
    {
        var days = to.DayNumber - from.DayNumber + 1;

        // One day is named the way somebody would say it out loud, which for
        // the two nearest days is not a date at all.
        if (days == 1 && today is DateOnly now)
        {
            if (from == now) return "сегодняшний день";
            if (from == now.AddDays(-1)) return "вчерашний день";

            return Said(from);
        }

        if (from.Day == 1 && to == new DateOnly(from.Year, from.Month, DateTime.DaysInMonth(from.Year, from.Month)))
            return $"{Month(from.Month)} {from.Year}";

        if (from.Month == 1 && from.Day == 1 && to.Month == 12 && to.Day == 31 && from.Year == to.Year)
            return $"{from.Year} год";

        if (days == 7) return "неделю";
        if (days == 1) return Said(from);

        return $"{days} дн. с {from:dd.MM} по {to:dd.MM}";
    }

    /// <summary>"26 августа" — a day as people say it.</summary>
    private static string Said(DateOnly date)
    {
        string[] months =
        [
            "января", "февраля", "марта", "апреля", "мая", "июня",
            "июля", "августа", "сентября", "октября", "ноября", "декабря",
        ];

        return $"{date.Day} {months[date.Month - 1]}";
    }

    private static string Month(int month) => month switch
    {
        1 => "январь", 2 => "февраль", 3 => "март", 4 => "апрель",
        5 => "май", 6 => "июнь", 7 => "июль", 8 => "август",
        9 => "сентябрь", 10 => "октябрь", 11 => "ноябрь", _ => "декабрь",
    };

    private static string Weekday(DayOfWeek day) => day switch
    {
        DayOfWeek.Monday => "понедельник",
        DayOfWeek.Tuesday => "вторник",
        DayOfWeek.Wednesday => "среду",
        DayOfWeek.Thursday => "четверг",
        DayOfWeek.Friday => "пятницу",
        DayOfWeek.Saturday => "субботу",
        _ => "воскресенье",
    };
}

public record AssistantReportDto(
    string title,
    string from,
    string to,
    string summary,
    string[] paragraphs,
    AssistantStatDto[] stats,
    /// <summary>"model" or "local" — never hidden from the reader.</summary>
    string source);

public record AssistantStatDto(string label, string value, string? hint);
