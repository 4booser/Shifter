using System.Globalization;

using Shifter.Application.Common.Text;

using Shifter.Application.Features.business.DTOs;
using Shifter.Domain.Entities;

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

    private static string Hours(double value, Say say) =>
        $"{Math.Round(value, value < 10 ? 1 : 0).ToString(Ru)} {say.Of("ч", "год")}";

    private static readonly string[] MonthsRu =
    [
        "января", "февраля", "марта", "апреля", "мая", "июня",
        "июля", "августа", "сентября", "октября", "ноября", "декабря",
    ];

    private static readonly string[] MonthsUk =
    [
        "січня", "лютого", "березня", "квітня", "травня", "червня",
        "липня", "серпня", "вересня", "жовтня", "листопада", "грудня",
    ];

    private static string Said(DateOnly date, Say say) =>
        $"{date.Day} {(say.IsUk ? MonthsUk : MonthsRu)[date.Month - 1]}";

    /// <summary>"1 раз", "2 раза", "5 раз" — both languages decline after a number.</summary>
    private static string Times(int count, Say say) =>
        $"{count} {Telegram.TelegramCommands.Plural(count, say.Of("раз", "раз"), say.Of("раза", "рази"), say.Of("раз", "разів"))}";

    /// <summary>In the accusative, because every use reads "on Friday".</summary>
    private static readonly string[] WeekdaysRu =
    [
        "воскресенье", "понедельник", "вторник", "среду",
        "четверг", "пятницу", "субботу",
    ];

    private static readonly string[] WeekdaysUk =
    [
        "неділю", "понеділок", "вівторок", "середу",
        "четвер", "п’ятницю", "суботу",
    ];

    public static BriefBlockDto[] Build(
        DaysDto month,
        DaysDto previous,
        DateOnly today,
        BriefFacts facts,
        AheadFacts ahead,
        string? lang = null,
        /// <summary>
        /// The rest somebody counts as enough. Eleven is the EU daily rule
        /// and the default nobody has to choose; a person who works split
        /// doubles by arrangement can set their own and stop being told.
        /// </summary>
        double restHours = RestBetweenShifts.DefaultHours)
    {
        var say = Say.In(lang);

        List<BriefBlockDto> blocks =
        [
            Today(month, today, facts, say),
            Month(month, previous, today, facts, say),
            Observations(month, previous, today, say, restHours),
            Ahead(month, today, ahead, say),
        ];

        return blocks.Where(block => block.lines.Length > 0).ToArray();
    }

    // ==== Today ====

    private static BriefBlockDto Today(DaysDto month, DateOnly today, BriefFacts facts, Say say)
    {
        List<BriefLineDto> lines = [];
        var day = month.days.FirstOrDefault(row => row.date == today);
        var shifts = day?.shifts ?? [];

        if (shifts.Length == 0)
        {
            lines.Add(new BriefLineDto(say.Of("Смен на сегодня не поставлено.", "Змін на сьогодні не поставлено.")));

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
                        ? say.Of($"Без смены {rest} дн. — последняя была {Said(last.date, say)}", $"Без зміни {rest} дн. — остання була {Said(last.date, say)}")
                        : say.Of($"Последняя смена была вчера, {Said(last.date, say)}", $"Остання зміна була вчора, {Said(last.date, say)}"),
                    Money(last.earned)));

            var off = month.days.Count(row => row.date <= today && !row.shifts.Any(shift => shift.worked))
                + Enumerable.Range(1, today.Day).Count(day =>
                    !month.days.Any(row => row.date.Day == day));

            if (off > 1) lines.Add(new BriefLineDto(say.Of($"Выходных с начала месяца: {off}", $"Вихідних від початку місяця: {off}")));
        }
        else
        {
            foreach (var shift in shifts)
                lines.Add(new BriefLineDto(
                    $"{shift.name} · {shift.start_time}–{shift.end_time}",
                    Money(shift.earned),
                    shift.worked ? "good" : null));

            if (shifts.Any(shift => !shift.worked))
                lines.Add(new BriefLineDto(say.Of("Смена ещё не отмечена как отработанная.", "Зміну ще не позначено як відпрацьовану.")));
        }

        if (facts.StreakDays > 1)
            lines.Add(new BriefLineDto(say.Of($"Подряд без выходного: {facts.StreakDays} дн.", $"Поспіль без вихідного: {facts.StreakDays} дн."), null,
                facts.StreakDays >= 6 ? "warn" : null));

        return new BriefBlockDto("today", "🌤️", say.Of("Сегодня", "Сьогодні"), [.. lines]);
    }

    // ==== The month so far ====

    private static BriefBlockDto Month(
        DaysDto month,
        DaysDto previous,
        DateOnly today,
        BriefFacts facts,
        Say say)
    {
        List<BriefLineDto> lines =
        [
            new BriefLineDto(
                say.Of($"{month.days_worked} смен, {Hours(month.hours, say)}", $"{month.days_worked} змін, {Hours(month.hours, say)}"),
                Money(month.total_earned),
                "good"),
        ];

        if (month.hours > 0)
            lines.Add(new BriefLineDto(say.Of("Ваш час стоит", "Ваша година коштує"), Money(month.total_earned / (decimal)month.hours)));

        if (facts.Goal is decimal goal && goal > 0)
        {
            var left = Math.Max(0m, goal - month.total_earned);

            lines.Add(left <= 0
                ? new BriefLineDto(say.Of($"Цель {Money(goal)} взята — дальше всё сверху.", $"Ціль {Money(goal)} взята — далі все зверху."), null, "good")
                : new BriefLineDto(say.Of($"До цели {Money(goal)} осталось", $"До цілі {Money(goal)} лишилося"), Money(left)));
        }
        else if (facts.ProjectedMonth > month.total_earned)
        {
            lines.Add(new BriefLineDto(say.Of("Такими темпами к концу месяца", "Такими темпами до кінця місяця"), Money(facts.ProjectedMonth)));
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
            // a number: say.Of("в 14 раз больше", "у 14 разів більше") is what a person would actually say.
            var wording = Math.Abs(change) < 3
                ? say.Of("Ровно столько же, сколько к этому дню прошлого месяца.", "Рівно стільки ж, скільки до цього дня минулого місяця.")
                : change > 200
                    ? say.Of($"В {Math.Round(month.total_earned / sameSpan, 1).ToString(Ru)} раза больше, чем к этому дню прошлого месяца", $"У {Math.Round(month.total_earned / sameSpan, 1).ToString(Ru)} рази більше, ніж до цього дня минулого місяця")
                    : change > 0
                        ? say.Of($"На {Math.Round(change)}% больше, чем к этому дню прошлого месяца", $"На {Math.Round(change)}% більше, ніж до цього дня минулого місяця")
                        : say.Of($"На {Math.Round(-change)}% меньше, чем к этому дню прошлого месяца", $"На {Math.Round(-change)}% менше, ніж до цього дня минулого місяця");

            lines.Add(Math.Abs(change) < 3
                ? new BriefLineDto(wording)
                : new BriefLineDto(wording, Money(sameSpan), change > 0 ? "good" : "warn"));
        }

        if (month.planned_earned > 0)
            lines.Add(new BriefLineDto(say.Of("Ещё в плане до конца месяца", "Ще в плані до кінця місяця"), Money(month.planned_earned)));

        return new BriefBlockDto("month", "📈", say.Of("Как идёт месяц", "Як іде місяць"), [.. lines]);
    }

    // ==== What the data noticed ====

    private static BriefBlockDto Observations(
        DaysDto month, DaysDto previous, DateOnly today, Say say, double restHours)
    {
        List<BriefLineDto> lines = [];

        // Up to today only. A future day carrying a worked flag is a data
        // oddity, and say.Of("лучший день — 29 августа", "найкращий день — 29 серпня") said on the 27th reads as a
        // bug whatever put it there.
        var worked = month.days
            .Where(day => day.date <= today && day.shifts.Any(shift => shift.worked))
            .ToArray();

        var best = worked.OrderByDescending(day => day.earned).FirstOrDefault();

        if (best is not null && best.earned > 0)
            lines.Add(new BriefLineDto(say.Of($"Лучший день — {Said(best.date, say)}", $"Найкращий день — {Said(best.date, say)}"), Money(best.earned), "good"));

        // Which weekday tips, averaged over the days worked rather than summed.
        var tipDays = worked
            .Where(day => day.tips is not null)
            .GroupBy(day => day.date.DayOfWeek)
            .Select(group => new { group.Key, Average = group.Average(day => day.tips!.Value) })
            .OrderByDescending(row => row.Average)
            .FirstOrDefault();

        if (tipDays is not null && tipDays.Average > 0)
            lines.Add(new BriefLineDto(
                say.Of($"Лучше всего на чай платят в {(say.IsUk ? WeekdaysUk : WeekdaysRu)[(int)tipDays.Key]}", $"Найкраще на чай платять у {(say.IsUk ? WeekdaysUk : WeekdaysRu)[(int)tipDays.Key]}"),
                Money(tipDays.Average)));

        if (month.revenue_earned > 0)
            lines.Add(new BriefLineDto(
                say.Of($"Процент принёс {Money(month.revenue_earned)} с выручки {Money(month.revenue_counted)}", $"Відсоток приніс {Money(month.revenue_earned)} з виторгу {Money(month.revenue_counted)}"),
                null,
                "good"));

        if (month.premium_earned > 0)
            lines.Add(new BriefLineDto(
                say.Of("Надбавки за ночные и праздники", "Надбавки за нічні та свята"), Money(month.premium_earned), "good"));

        if (month.overtime_hours > 0)
            lines.Add(new BriefLineDto(
                say.Of($"Переработки: {Hours(month.overtime_hours, say)}", $"Понаднормові: {Hours(month.overtime_hours, say)}"), Money(month.overtime_earned), "warn"));

        // Blanks: a worked day with no tips figure at all is a hole in the
        // record, and the totals quietly understate because of it.
        var blank = worked.Count(day => day.tips is null && day.tip_pool is null);

        if (blank > 0)
            lines.Add(new BriefLineDto(
                say.Of($"Смен без записанных чаевых: {blank}. Итоги из-за этого занижены.", $"Змін без записаних чайових: {blank}. Підсумки через це занижені."), null, "warn"));

        var underpaid = worked.Count(day => day.below_floor);

        if (underpaid > 0)
            lines.Add(new BriefLineDto(
                say.Of($"Дней ниже вашей планки за час: {underpaid}", $"Днів нижче вашої планки за годину: {underpaid}"), null, "warn"));

        // Close-then-open: the industry's own name for the thing that eats
        // people. Counting it was the old line, and counting is the part that
        // stops working — by the third one in a fortnight it stops feeling
        // unusual. The shortest gap is the number somebody repeats out loud.
        var rests = RestBetweenShifts.Find(Spans(month), restHours);

        if (rests.Count > 0)
        {
            var shortest = RestBetweenShifts.Shortest(rests) ?? restHours;

            lines.Add(new BriefLineDto(
                say.Of(
                    $"Закрытие и открытие подряд: {Times(rests.Count, say)} — меньше {Hours(restHours, say)} между сменами",
                    $"Закриття і відкриття поспіль: {Times(rests.Count, say)} — менше ніж {Hours(restHours, say)} між змінами"),
                null,
                "warn"));

            lines.Add(new BriefLineDto(
                say.Of(
                    $"Короче всего было {Hours(shortest, say)} — с ухода до выхода",
                    $"Найкоротше було {Hours(shortest, say)} — від виходу до виходу"),
                null,
                shortest <= restHours / 2 ? "warn" : null));
        }

        // The run happening right now, said as a number and its history —
        // never as advice. Twelve days in a row is a fact a person notices
        // on the tenth; the app can see it on the third, and its whole job
        // here is to say it out loud. Both months' days feed the count, so
        // a streak straddling the 1st is not cut in half by the calendar.
        var streakDays = month.days.Concat(previous.days)
            .Where(day => day.shifts.Any(shift => shift.worked))
            .Select(day => day.date)
            .ToArray();

        var streak = Domain.Entities.WorkStreaks.Current(streakDays, today);

        if (streak >= 5)
        {
            var record = Domain.Entities.WorkStreaks.Longest(streakDays);

            lines.Add(new BriefLineDto(
                streak >= record
                    ? say.Of(
                        $"{Nth(streak, false)} день подряд — длиннее серии у вас не было",
                        $"{Nth(streak, true)} день поспіль — довшої серії у вас не було")
                    : say.Of(
                        $"{Nth(streak, false)} день подряд; самая длинная серия была {record} дней",
                        $"{Nth(streak, true)} день поспіль; найдовша серія була {record} днів"),
                null,
                streak >= 7 ? "warn" : null));
        }

        // The average shift: the figure people compare a new job against.
        var placed = worked.SelectMany(day => day.shifts.Where(shift => shift.worked)).ToArray();

        if (placed.Length > 1)
            lines.Add(new BriefLineDto(
                say.Of($"Средняя смена — {Hours(placed.Average(shift => shift.hours), say)}", $"Середня зміна — {Hours(placed.Average(shift => shift.hours), say)}"),
                Money(placed.Average(shift => shift.earned))));

        var longest = placed.OrderByDescending(shift => shift.hours).FirstOrDefault();

        if (longest is not null && longest.hours >= 10)
            lines.Add(new BriefLineDto(
                say.Of($"Самая длинная смена — {Hours(longest.hours, say)}", $"Найдовша зміна — {Hours(longest.hours, say)}"), null, longest.hours >= 12 ? "warn" : null));

        var favourite = placed
            .GroupBy(shift => shift.name)
            .OrderByDescending(group => group.Count())
            .FirstOrDefault();

        if (favourite is not null && favourite.Count() > 1 && placed.Select(s => s.name).Distinct().Count() > 1)
            lines.Add(new BriefLineDto(say.Of($"Чаще всего выходили на «{favourite.Key}» — {Times(favourite.Count(), say)}", $"Найчастіше виходили на «{favourite.Key}» — {Times(favourite.Count(), say)}")));

        if (month.night_hours > 0 && month.hours > 0)
            lines.Add(new BriefLineDto(
                say.Of($"Ночных часов {Hours(month.night_hours, say)} — {Math.Round(month.night_hours / month.hours * 100)}% всех", $"Нічних годин {Hours(month.night_hours, say)} — {Math.Round(month.night_hours / month.hours * 100)}% усіх")));

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
                        ? say.Of($"Выходная смена приносит на {Math.Round((weekendAverage / weekdayAverage - 1m) * 100m)}% больше будней", $"Вихідна зміна приносить на {Math.Round((weekendAverage / weekdayAverage - 1m) * 100m)}% більше за будні")
                        : say.Of($"Выходная смена приносит на {Math.Round((1m - weekendAverage / weekdayAverage) * 100m)}% меньше будней", $"Вихідна зміна приносить на {Math.Round((1m - weekendAverage / weekdayAverage) * 100m)}% менше за будні"),
                    Money(weekendAverage)));
        }

        if (month.sales_earned > 0)
            lines.Add(new BriefLineDto(say.Of("Продажи принесли", "Продажі принесли"), Money(month.sales_earned), "good"));

        // Shifts placed in the past and never marked: the totals are waiting
        // on them, and nothing else will point it out.
        var unmarked = month.days
            .Where(day => day.date < today)
            .SelectMany(day => day.shifts.Where(shift => !shift.worked))
            .Count();

        if (unmarked > 0)
            lines.Add(new BriefLineDto(
                say.Of($"Прошедших смен без отметки «отработана»: {unmarked}", $"Минулих змін без позначки «відпрацьована»: {unmarked}"), null, "warn"));

        if (month.tip_out > 0)
            lines.Add(new BriefLineDto(say.Of("Отдано персоналу из чаевых", "Віддано персоналу з чайових"), Money(month.tip_out)));

        if (month.tax > 0)
            lines.Add(new BriefLineDto(say.Of($"Налог {Money(month.tax)} — на руки", $"Податок {Money(month.tax)} — на руки"), Money(month.net_earned)));

        if (month.by_location.Length > 1)
        {
            var top = month.by_location.OrderByDescending(place => place.earned).First();

            lines.Add(new BriefLineDto(
                $"Больше всего приносит {(top.location_id == 0 ? "работа без места" : top.name)}",
                Money(top.earned)));
        }

        return new BriefBlockDto("observations", "🔍", say.Of("Что видно по цифрам", "Що видно з цифр"), [.. lines]);
    }

    /// <summary>Whether the day this shift sits on is a Saturday or Sunday.</summary>
    private static bool IsWeekend(DayDto[] days, DayShiftDto shift)
    {
        var day = days.FirstOrDefault(row => row.shifts.Contains(shift));

        return day is not null
            && day.date.DayOfWeek is DayOfWeek.Saturday or DayOfWeek.Sunday;
    }

    /// <summary>
    /// Every worked shift as an interval on one continuous clock, so a night
    /// ending at 04:00 and a morning starting at 09:00 is five hours apart
    /// rather than nineteen.
    /// </summary>
    /// <summary>«Седьмой» / «Сьомий»: the streak said the way a person says it.</summary>
    private static string Nth(int day, bool uk)
    {
        string[] ru = ["Пятый", "Шестой", "Седьмой", "Восьмой", "Девятый", "Десятый", "Одиннадцатый", "Двенадцатый", "Тринадцатый", "Четырнадцатый"];
        string[] ua = ["П'ятий", "Шостий", "Сьомий", "Восьмий", "Дев'ятий", "Десятий", "Одинадцятий", "Дванадцятий", "Тринадцятий", "Чотирнадцятий"];
        var words = uk ? ua : ru;

        // Past the words, the number itself reads better than a made-up word.
        return day - 5 < words.Length ? words[day - 5] : $"{day}-й";
    }

    private static List<(DateTime Start, DateTime End)> Spans(DaysDto month)
    {
        List<(DateTime Start, DateTime End)> spans = [];

        foreach (var day in month.days)
        {
            foreach (var shift in day.shifts.Where(entry => entry.worked))
            {
                // What was actually worked where that was recorded: a shift
                // that ran two hours over ate two hours of the rest after it.
                if (!TimeOnly.TryParse(shift.actual_start ?? shift.start_time, out var from)) continue;
                if (!TimeOnly.TryParse(shift.actual_end ?? shift.end_time, out var to)) continue;

                var start = day.date.ToDateTime(from);
                var end = day.date.ToDateTime(to);

                if (end <= start) end = end.AddDays(1);

                spans.Add((start, end));
            }
        }

        return spans;
    }

    // ==== What is coming ====

    private static BriefBlockDto Ahead(DaysDto month, DateOnly today, AheadFacts ahead, Say say)
    {
        List<BriefLineDto> lines = [];

        if (ahead.NextShiftOn is DateOnly next)
            lines.Add(new BriefLineDto(
                say.Of($"Следующая смена — {Said(next, say)}, {ahead.NextShiftName}", $"Наступна зміна — {Said(next, say)}, {ahead.NextShiftName}"),
                ahead.NextShiftFrom));
        else
            lines.Add(new BriefLineDto(say.Of("Впереди пока ни одной поставленной смены.", "Попереду поки жодної поставленої зміни."), null, "warn"));

        if (ahead.DaysToPayday is int days)
            lines.Add(new BriefLineDto(
                days == 0 ? say.Of("Деньги должны прийти сегодня", "Гроші мають прийти сьогодні") : say.Of($"Ближайшие деньги через {days} дн.", $"Найближчі гроші через {days} дн."),
                ahead.PaydayAmount is decimal amount ? Money(amount) : null,
                "good"));

        var restAhead = month.days
            .Count(day => day.date > today && day.shifts.Length == 0);

        // Only worth saying where the month still has room to be filled.
        var left = DateTime.DaysInMonth(today.Year, today.Month) - today.Day;

        if (left > 0 && restAhead == left)
            lines.Add(new BriefLineDto(say.Of("До конца месяца ничего не запланировано.", "До кінця місяця нічого не заплановано.")));

        return new BriefBlockDto("ahead", "📅", say.Of("Что впереди", "Що попереду"), [.. lines]);
    }
}

/// <summary>The near future, gathered by the service because it needs the places.</summary>
public sealed record AheadFacts(
    DateOnly? NextShiftOn,
    string? NextShiftName,
    string? NextShiftFrom,
    int? DaysToPayday,
    decimal? PaydayAmount);
