using System.Globalization;

using Shifter.Application.Features.business.DTOs;

namespace Shifter.Application.Features.Brief;

/// <summary>One line of the day page: a sentence, sometimes a figure beside it.</summary>
public record BriefLineDto(
    string text,
    /// <summary>A number worth setting apart, already formatted. Null where the sentence is the whole point.</summary>
    string? value = null,
    /// <summary>"good", "warn" or null. Colour is meaning here, never decoration.</summary>
    string? tone = null);

/// <summary>A section of the day page. Empty sections are never sent.</summary>
public record BriefBlockDto(string kind, string emoji, string title, BriefLineDto[] lines);

/// <summary>
/// The day page: today, the month, and what the data noticed. Every line is
/// arithmetic somebody could check against their own calendar — the model,
/// where there is one, writes the paragraph at the top and never these.
///
/// Observations earn their place or are left out. A page that pads itself to
/// a fixed length teaches people to stop reading it.
/// </summary>
public static class BriefBlocks
{
    private static readonly CultureInfo Ru = CultureInfo.GetCultureInfo("ru-RU");

    private static string Money(decimal value) =>
        $"{Math.Round(value).ToString("N0", Ru).Replace(',', ' ')} ₴";

    private static string Hours(double value) =>
        $"{Math.Round(value, value < 10 ? 1 : 0).ToString(Ru)} ч";

    private static readonly string[] Months =
    [
        "января", "февраля", "марта", "апреля", "мая", "июня",
        "июля", "августа", "сентября", "октября", "ноября", "декабря",
    ];

    private static string Said(DateOnly date) => $"{date.Day} {Months[date.Month - 1]}";

    /// <summary>"1 раз", "2 раза", "5 раз" — Russian declines after a number.</summary>
    private static string Times(int count) =>
        $"{count} {Telegram.TelegramCommands.Plural(count, "раз", "раза", "раз")}";

    private static readonly string[] Weekdays =
    [
        "воскресенье", "понедельник", "вторник", "среду",
        "четверг", "пятницу", "субботу",
    ];

    public static BriefBlockDto[] Build(
        DaysDto month,
        DaysDto previous,
        DateOnly today,
        BriefFacts facts,
        AheadFacts ahead)
    {
        List<BriefBlockDto> blocks =
        [
            Today(month, today, facts),
            Month(month, previous, today, facts),
            Observations(month, previous, today),
            Ahead(month, today, ahead),
        ];

        return blocks.Where(block => block.lines.Length > 0).ToArray();
    }

    // ==== Today ====

    private static BriefBlockDto Today(DaysDto month, DateOnly today, BriefFacts facts)
    {
        List<BriefLineDto> lines = [];
        var day = month.days.FirstOrDefault(row => row.date == today);
        var shifts = day?.shifts ?? [];

        if (shifts.Length == 0)
        {
            lines.Add(new BriefLineDto("Смен на сегодня не поставлено."));

            // How long the rest has been, counted backwards from today. A
            // fourth day off in a row is worth knowing about; so is a first.
            var rest = 0;

            for (var cursor = today; !month.days.Any(row =>
                     row.date == cursor && row.shifts.Any(shift => shift.worked)); cursor = cursor.AddDays(-1))
            {
                rest++;

                if (cursor.Day == 1) break;
            }

            var last = month.days
                .Where(row => row.date < today && row.shifts.Any(shift => shift.worked))
                .OrderByDescending(row => row.date)
                .FirstOrDefault();

            if (last is not null)
                lines.Add(new BriefLineDto(
                    rest > 1
                        ? $"Без смены {rest} дн. — последняя была {Said(last.date)}"
                        : $"Последняя смена была вчера, {Said(last.date)}",
                    Money(last.earned)));

            var off = month.days.Count(row => row.date <= today && !row.shifts.Any(shift => shift.worked))
                + Enumerable.Range(1, today.Day).Count(day =>
                    !month.days.Any(row => row.date.Day == day));

            if (off > 1) lines.Add(new BriefLineDto($"Выходных с начала месяца: {off}"));
        }
        else
        {
            foreach (var shift in shifts)
                lines.Add(new BriefLineDto(
                    $"{shift.name} · {shift.start_time}–{shift.end_time}",
                    Money(shift.earned),
                    shift.worked ? "good" : null));

            if (shifts.Any(shift => !shift.worked))
                lines.Add(new BriefLineDto("Смена ещё не отмечена как отработанная."));
        }

        if (facts.StreakDays > 1)
            lines.Add(new BriefLineDto($"Подряд без выходного: {facts.StreakDays} дн.", null,
                facts.StreakDays >= 6 ? "warn" : null));

        return new BriefBlockDto("today", "🌤️", "Сегодня", [.. lines]);
    }

    // ==== The month so far ====

    private static BriefBlockDto Month(DaysDto month, DaysDto previous, DateOnly today, BriefFacts facts)
    {
        List<BriefLineDto> lines =
        [
            new BriefLineDto(
                $"{month.days_worked} смен, {Hours(month.hours)}",
                Money(month.total_earned),
                "good"),
        ];

        if (month.hours > 0)
            lines.Add(new BriefLineDto("Ваш час стоит", Money(month.total_earned / (decimal)month.hours)));

        if (facts.Goal is decimal goal && goal > 0)
        {
            var left = Math.Max(0m, goal - month.total_earned);

            lines.Add(left <= 0
                ? new BriefLineDto($"Цель {Money(goal)} взята — дальше всё сверху.", null, "good")
                : new BriefLineDto($"До цели {Money(goal)} осталось", Money(left)));
        }
        else if (facts.ProjectedMonth > month.total_earned)
        {
            lines.Add(new BriefLineDto("Такими темпами к концу месяца", Money(facts.ProjectedMonth)));
        }

        // Only the same number of days back, or a full month always beats a
        // month that is nine days old.
        var elapsed = today.Day;
        var sameSpan = previous.days
            .Where(row => row.date.Day <= elapsed)
            .Sum(row => row.earned);

        if (sameSpan > 0 && month.total_earned > 0)
        {
            var change = (double)((month.total_earned - sameSpan) / sameSpan) * 100;

            // Past a couple of hundred percent the number stops being read as
            // a number: "в 14 раз больше" is what a person would actually say.
            var wording = Math.Abs(change) < 3
                ? "Ровно столько же, сколько к этому дню прошлого месяца."
                : change > 200
                    ? $"В {Math.Round(month.total_earned / sameSpan, 1).ToString(Ru)} раза больше, чем к этому дню прошлого месяца"
                    : change > 0
                        ? $"На {Math.Round(change)}% больше, чем к этому дню прошлого месяца"
                        : $"На {Math.Round(-change)}% меньше, чем к этому дню прошлого месяца";

            lines.Add(Math.Abs(change) < 3
                ? new BriefLineDto(wording)
                : new BriefLineDto(wording, Money(sameSpan), change > 0 ? "good" : "warn"));
        }

        if (month.planned_earned > 0)
            lines.Add(new BriefLineDto("Ещё в плане до конца месяца", Money(month.planned_earned)));

        return new BriefBlockDto("month", "📈", "Как идёт месяц", [.. lines]);
    }

    // ==== What the data noticed ====

    private static BriefBlockDto Observations(DaysDto month, DaysDto previous, DateOnly today)
    {
        List<BriefLineDto> lines = [];

        // Up to today only. A future day carrying a worked flag is a data
        // oddity, and "лучший день — 29 августа" said on the 27th reads as a
        // bug whatever put it there.
        var worked = month.days
            .Where(day => day.date <= today && day.shifts.Any(shift => shift.worked))
            .ToArray();

        var best = worked.OrderByDescending(day => day.earned).FirstOrDefault();

        if (best is not null && best.earned > 0)
            lines.Add(new BriefLineDto($"Лучший день — {Said(best.date)}", Money(best.earned), "good"));

        // Which weekday tips, averaged over the days worked rather than summed.
        var tipDays = worked
            .Where(day => day.tips is not null)
            .GroupBy(day => day.date.DayOfWeek)
            .Select(group => new { group.Key, Average = group.Average(day => day.tips!.Value) })
            .OrderByDescending(row => row.Average)
            .FirstOrDefault();

        if (tipDays is not null && tipDays.Average > 0)
            lines.Add(new BriefLineDto(
                $"Лучше всего на чай платят в {Weekdays[(int)tipDays.Key]}",
                Money(tipDays.Average)));

        if (month.revenue_earned > 0)
            lines.Add(new BriefLineDto(
                $"Процент принёс {Money(month.revenue_earned)} с выручки {Money(month.revenue_counted)}",
                null,
                "good"));

        if (month.premium_earned > 0)
            lines.Add(new BriefLineDto(
                $"Надбавки за ночные и праздники", Money(month.premium_earned), "good"));

        if (month.overtime_hours > 0)
            lines.Add(new BriefLineDto(
                $"Переработки: {Hours(month.overtime_hours)}", Money(month.overtime_earned), "warn"));

        // Blanks: a worked day with no tips figure at all is a hole in the
        // record, and the totals quietly understate because of it.
        var blank = worked.Count(day => day.tips is null && day.tip_pool is null);

        if (blank > 0)
            lines.Add(new BriefLineDto(
                $"Смен без записанных чаевых: {blank}. Итоги из-за этого занижены.", null, "warn"));

        var underpaid = worked.Count(day => day.below_floor);

        if (underpaid > 0)
            lines.Add(new BriefLineDto(
                $"Дней ниже вашей планки за час: {underpaid}", null, "warn"));

        // Close-then-open: the industry's own name for the thing that eats
        // people, and it only reads as a problem when it is counted.
        var clopenings = Clopenings(month);

        if (clopenings > 0)
            lines.Add(new BriefLineDto(
                $"Закрытие и открытие подряд: {Times(clopenings)} — между сменами меньше 11 ч",
                null,
                "warn"));

        // The average shift: the figure people compare a new job against.
        var placed = worked.SelectMany(day => day.shifts.Where(shift => shift.worked)).ToArray();

        if (placed.Length > 1)
            lines.Add(new BriefLineDto(
                $"Средняя смена — {Hours(placed.Average(shift => shift.hours))}",
                Money(placed.Average(shift => shift.earned))));

        var longest = placed.OrderByDescending(shift => shift.hours).FirstOrDefault();

        if (longest is not null && longest.hours >= 10)
            lines.Add(new BriefLineDto(
                $"Самая длинная смена — {Hours(longest.hours)}", null, longest.hours >= 12 ? "warn" : null));

        var favourite = placed
            .GroupBy(shift => shift.name)
            .OrderByDescending(group => group.Count())
            .FirstOrDefault();

        if (favourite is not null && favourite.Count() > 1 && placed.Select(s => s.name).Distinct().Count() > 1)
            lines.Add(new BriefLineDto($"Чаще всего выходили на «{favourite.Key}» — {Times(favourite.Count())}"));

        if (month.night_hours > 0 && month.hours > 0)
            lines.Add(new BriefLineDto(
                $"Ночных часов {Hours(month.night_hours)} — {Math.Round(month.night_hours / month.hours * 100)}% всех"));

        // Weekend against weekday, per shift rather than in total: two Saturdays
        // and twelve Tuesdays would otherwise say the wrong thing.
        var weekend = placed.Where(shift => IsWeekend(worked, shift)).ToArray();
        var weekday = placed.Except(weekend).ToArray();

        if (weekend.Length > 0 && weekday.Length > 0)
        {
            var weekendAverage = weekend.Average(shift => shift.earned);
            var weekdayAverage = weekday.Average(shift => shift.earned);

            if (weekdayAverage > 0m && Math.Abs(weekendAverage - weekdayAverage) / weekdayAverage > 0.15m)
                lines.Add(new BriefLineDto(
                    weekendAverage > weekdayAverage
                        ? $"Выходная смена приносит на {Math.Round((weekendAverage / weekdayAverage - 1m) * 100m)}% больше будней"
                        : $"Выходная смена приносит на {Math.Round((1m - weekendAverage / weekdayAverage) * 100m)}% меньше будней",
                    Money(weekendAverage)));
        }

        if (month.sales_earned > 0)
            lines.Add(new BriefLineDto("Продажи принесли", Money(month.sales_earned), "good"));

        // Shifts placed in the past and never marked: the totals are waiting
        // on them, and nothing else will point it out.
        var unmarked = month.days
            .Where(day => day.date < today)
            .SelectMany(day => day.shifts.Where(shift => !shift.worked))
            .Count();

        if (unmarked > 0)
            lines.Add(new BriefLineDto(
                $"Прошедших смен без отметки «отработана»: {unmarked}", null, "warn"));

        if (month.tip_out > 0)
            lines.Add(new BriefLineDto("Отдано персоналу из чаевых", Money(month.tip_out)));

        if (month.tax > 0)
            lines.Add(new BriefLineDto($"Налог {Money(month.tax)} — на руки", Money(month.net_earned)));

        if (month.by_location.Length > 1)
        {
            var top = month.by_location.OrderByDescending(place => place.earned).First();

            lines.Add(new BriefLineDto(
                $"Больше всего приносит {(top.location_id == 0 ? "работа без места" : top.name)}",
                Money(top.earned)));
        }

        return new BriefBlockDto("observations", "🔍", "Что видно по цифрам", [.. lines]);
    }

    /// <summary>Whether the day this shift sits on is a Saturday or Sunday.</summary>
    private static bool IsWeekend(DayDto[] days, DayShiftDto shift)
    {
        var day = days.FirstOrDefault(row => row.shifts.Contains(shift));

        return day is not null
            && day.date.DayOfWeek is DayOfWeek.Saturday or DayOfWeek.Sunday;
    }

    /// <summary>
    /// Shifts that end and start again inside eleven hours. Counted across the
    /// whole month on a single minute line so a night shift ending at 04:00
    /// and a morning starting at 09:00 is seen for what it is.
    /// </summary>
    private static int Clopenings(DaysDto month)
    {
        List<(DateTime Start, DateTime End)> spans = [];

        foreach (var day in month.days)
        {
            foreach (var shift in day.shifts.Where(entry => entry.worked))
            {
                if (!TimeOnly.TryParse(shift.start_time, out var from)) continue;
                if (!TimeOnly.TryParse(shift.end_time, out var to)) continue;

                var start = day.date.ToDateTime(from);
                var end = day.date.ToDateTime(to);

                if (end <= start) end = end.AddDays(1);

                spans.Add((start, end));
            }
        }

        spans.Sort((left, right) => left.Start.CompareTo(right.Start));

        var count = 0;

        for (var index = 1; index < spans.Count; index++)
            if ((spans[index].Start - spans[index - 1].End).TotalHours is > 0 and < 11)
                count++;

        return count;
    }

    // ==== What is coming ====

    private static BriefBlockDto Ahead(DaysDto month, DateOnly today, AheadFacts ahead)
    {
        List<BriefLineDto> lines = [];

        if (ahead.NextShiftOn is DateOnly next)
            lines.Add(new BriefLineDto(
                $"Следующая смена — {Said(next)}, {ahead.NextShiftName}",
                ahead.NextShiftFrom));
        else
            lines.Add(new BriefLineDto("Впереди пока ни одной поставленной смены.", null, "warn"));

        if (ahead.DaysToPayday is int days)
            lines.Add(new BriefLineDto(
                days == 0 ? "Деньги должны прийти сегодня" : $"Ближайшие деньги через {days} дн.",
                ahead.PaydayAmount is decimal amount ? Money(amount) : null,
                "good"));

        var restAhead = month.days
            .Count(day => day.date > today && day.shifts.Length == 0);

        // Only worth saying where the month still has room to be filled.
        var left = DateTime.DaysInMonth(today.Year, today.Month) - today.Day;

        if (left > 0 && restAhead == left)
            lines.Add(new BriefLineDto("До конца месяца ничего не запланировано."));

        return new BriefBlockDto("ahead", "📅", "Что впереди", [.. lines]);
    }
}

/// <summary>The near future, gathered by the service because it needs the places.</summary>
public sealed record AheadFacts(
    DateOnly? NextShiftOn,
    string? NextShiftName,
    string? NextShiftFrom,
    int? DaysToPayday,
    decimal? PaydayAmount);
