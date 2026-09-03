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
    private static readonly CultureInfo Ru = Figures.Ru;

    private static string Money(decimal value) => Figures.Money(value);

    private static string Hours(double value, Say say) =>
        $"{Figures.Hours(value)} {say.Of("ч", "год")}";

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
        double restHours = RestBetweenShifts.DefaultHours,
        int weeklyGoalStreak = 0)
    {
        var say = Say.In(lang);

        List<BriefBlockDto> blocks =
        [
            Today(month, today, facts, say),
            Month(month, previous, today, facts, say),
            Observations(month, previous, today, say, restHours, weeklyGoalStreak),
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
        // The totals, the projection and the goal already sit on the tiles a
        // few pixels up (and in the brief's own prose); repeating them here
        // was the page saying one thing four times. What this block owns is
        // the comparison — the line the tiles cannot say.
        List<BriefLineDto> lines = [];

        // An hourly rate divided out of minutes is not a rate. A month holding
        // one shift closed after fifty seconds priced the hour at −₴7 805 in
        // the day's own summary, beside two other screens that had already
        // learned to say nothing. Under an hour there is no hour to quote.
        if (month.hours >= 1)
            lines.Add(new BriefLineDto(say.Of("Ваш час стоит", "Ваша година коштує"), Money(month.total_earned / (decimal)month.hours)));

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
                    ? Multiple(month.total_earned / sameSpan, say)
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
        DaysDto month, DaysDto previous, DateOnly today, Say say, double restHours, int weeklyGoalStreak = 0)
    {
        List<BriefLineDto> lines = [];

        // Up to today only. A future day carrying a worked flag is a data
        // oddity, and say.Of("лучший день — 29 августа", "найкращий день — 29 серпня") said on the 27th reads as a
        // bug whatever put it there.
        var worked = month.days
            .Where(day => day.date <= today && day.shifts.Any(shift => shift.worked))
            .ToArray();

        var best = worked.OrderByDescending(day => day.earned).FirstOrDefault();

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
                        $"{Nth(streak, false)} день подряд; самая длинная серия была {record} {Telegram.TelegramCommands.Plural(record, "день", "дня", "дней")}",
                        $"{Nth(streak, true)} день поспіль; найдовша серія була {record} {Telegram.TelegramCommands.Plural(record, "день", "дні", "днів")}"),
                null,
                streak >= 7 ? "warn" : null));
        }

        // Closed weekly goals in a row: the same tone as the day streak —
        // a number and its history, never advice.
        if (weeklyGoalStreak >= 3)
        {
            lines.Add(new BriefLineDto(
                say.Of(
                    $"Недельная цель закрыта {weeklyGoalStreak} недель подряд",
                    $"Тижнева мета закрита {weeklyGoalStreak} тижнів поспіль"),
                null,
                "good"));
        }

        // Weekend against weekday, per shift rather than in total: two Saturdays
        // and twelve Tuesdays would otherwise say the wrong thing.
        var placed = worked.SelectMany(day => day.shifts.Where(shift => shift.worked)).ToArray();
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

        // Shifts placed in the past and never marked: the totals are waiting
        // on them, and nothing else will point it out.
        var unmarked = month.days
            .Where(day => day.date < today)
            .SelectMany(day => day.shifts.Where(shift => !shift.worked))
            .Count();

        if (unmarked > 0)
            lines.Add(new BriefLineDto(
                say.Of($"Прошедших смен без отметки «отработана»: {unmarked}", $"Минулих змін без позначки «відпрацьована»: {unmarked}"), null, "warn"));

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
    /// <summary>
    /// «В 14 раз больше», never «в 14 раза».
    ///
    /// The multiple only appears past three, which is exactly where the word
    /// stops taking the two-to-four form for whole numbers — and the comment
    /// above this branch already said «в 14 раз» is what a person would
    /// actually say, while the code wrote «раза». A fraction keeps «раза»:
    /// «в 3,5 раза больше» is right and «в 3,5 раз» is not.
    /// </summary>
    private static string Multiple(decimal ratio, Say say)
    {
        var shown = Math.Round(ratio, 1);
        var whole = shown == Math.Truncate(shown);
        var count = (int)Math.Truncate(shown);

        var ru = whole ? Telegram.TelegramCommands.Plural(count, "раз", "раза", "раз") : "раза";
        var ua = whole ? Telegram.TelegramCommands.Plural(count, "раз", "рази", "разів") : "раза";

        return say.Of(
            $"В {shown.ToString(Ru)} {ru} больше, чем к этому дню прошлого месяца",
            $"У {shown.ToString(Ru)} {ua} більше, ніж до цього дня минулого місяця");
    }

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
