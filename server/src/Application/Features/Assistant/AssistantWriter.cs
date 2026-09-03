using System.Globalization;

using Shifter.Application.Common.Text;

namespace Shifter.Application.Features.Assistant;

/// <summary>
/// The assistant without a model behind it. Every answer here is arithmetic
/// somebody could check, matched to the question by the words people actually
/// use — "сколько", "лучший день", "когда заплатят". It exists because the
/// feature has to be worth opening on a server with no key, and because when
/// the model does answer, this is the floor its answer has to beat.
/// </summary>
public static class AssistantWriter
{
    private static readonly CultureInfo Ru = Figures.Ru;

    public static string Money(decimal value) => Figures.Money(value);

    private static string Hours(double value) => $"{Figures.Hours(value)} ч";

    /// <summary>
    /// A plain count, grouped the way the money beside it is.
    ///
    /// The assistant's card put «Заработано 359 396 ₴» next to «Часов 2512»,
    /// two spellings of a thousand a finger apart.
    /// </summary>
    public static string Count(double value) => Figures.Count(value);

    /// <summary>
    /// "1 смена", "2 смены", "5 смен". Russian declines after a number and
    /// getting it wrong is the tell that nobody read the sentence out loud.
    /// </summary>
    private static string Shifts(int count) =>
        $"{count} {Telegram.TelegramCommands.Plural(count, "смена", "смены", "смен")}";

    /// <summary>A plain reply to a plain question, from figures we counted.</summary>
    public static string Answer(string question, AssistantFacts facts)
    {
        var text = question.ToLowerInvariant();

        bool Asks(params string[] words) => words.Any(text.Contains);

        // Two currencies cannot be added into one sentence. Saying "22 010"
        // when part of it is zloty is the same lie as printing zloty with a
        // hryvnia mark, and here it would be said out loud with confidence.
        if (facts.Currencies.Length > 1 && !Asks("где", "мест", "заведен"))
            return $"За {facts.Period} деньги пришли в разных валютах "
                   + $"({string.Join(", ", facts.Currencies)}), поэтому одной суммой их не назвать. "
                   + Places(facts)
                   + " Пересчёт в одну валюту — на странице статистики, там же виден курс.";

        // First, because "в какой день лучше чай" contains both "лучш" and
        // "чай" and would otherwise be answered with the best day's takings.
        if (Asks("чаев", "чай", "типс") && Asks("какой день", "день недели", "лучш", "когда"))
            return facts.BestTipWeekday is null
                ? "Чаевые пока не отмечены ни на одном дне, так что и сравнивать нечего."
                : $"Лучше всего платят в {facts.BestTipWeekday} — в среднем {Money(facts.BestTipAverage)} "
                  + "за такой день.";

        if (Asks("лучш", "самый денежн", "рекорд"))
            return facts.BestDayDate is null
                ? "Пока нет ни одного отработанного дня, так что и лучшего нет."
                : $"Лучший день — {Said(facts.BestDayDate)}: {Money(facts.BestDayAmount)}. "
                  + $"Это {Share(facts.BestDayAmount, facts.Earned)} от всего заработка за {facts.Period}.";

        // Under an hour there is no hour to price. The web pages settled this
        // the same way after a shift closed at fifty seconds priced the hour
        // at −₴3 805; the assistant was still saying it out loud.
        if (Asks("час", "почас", "в час"))
            return facts.Hours < 1
                ? "За этот период отработанного часа не набралось, так что и ставки в час не выходит."
                : $"Ваш час стоит {Money(facts.PerHour)}: {Money(facts.Earned)} за {Hours(facts.Hours)}."
                  + (facts.NightHours > 0 ? $" Из них {Hours(facts.NightHours)} — ночные." : "");

        if (Asks("чаев", "чай", "типс"))
            return facts.TipsEarned <= 0
                ? "Чаевые за этот период не отмечены."
                : $"Чаевых {Money(facts.TipsEarned)} — {Share(facts.TipsEarned, facts.Earned)} от заработка."
                  + (facts.TipOut > 0 ? $" Из них {Money(facts.TipOut)} ушло персоналу." : "");

        if (Asks("процент", "выручк"))
            return facts.RevenueEarned <= 0
                ? "Процент от выручки за этот период ничего не принёс — либо его нет в шаблонах, либо выручка не записана."
                : $"Процент принёс {Money(facts.RevenueEarned)} с выручки {Money(facts.RevenueCounted)}. "
                  + $"Это {Share(facts.RevenueEarned, facts.Earned)} от всего заработка.";

        // "когда зарплата" is about the date; "какая зарплата" is about the
        // figure and falls through to the earnings answer below.
        if ((Asks("когда") && Asks("зарплат", "деньги", "аванс", "придут")) || Asks("выплат"))
            return facts.DaysToPayday is not int wait
                ? "Сверка выплат молчит: либо всё уже выплачено, либо у мест не задан день зарплаты."
                : wait == 0
                    ? $"Деньги должны прийти сегодня{(facts.PaydayAmount is decimal now && now > 0 ? $" — {Money(now)}" : "")}."
                    : $"Ближайшие деньги через {wait} {Telegram.TelegramCommands.Plural(wait, "день", "дня", "дней")}"
                      + (facts.PaydayAmount is decimal amount && amount > 0 ? $" — {Money(amount)}." : ".");

        if (Asks("налог", "на руки", "нетто"))
            return facts.Tax <= 0
                ? $"Налог нигде не удерживался, так что на руки — все {Money(facts.Earned)}."
                : $"Удержано налога {Money(facts.Tax)}, на руки выходит {Money(facts.Net)}.";

        if (Asks("перераб", "сверхуроч"))
            return facts.OvertimeHours <= 0
                ? "Переработок за этот период не было."
                : $"Переработки: {Hours(facts.OvertimeHours)}, и они добавили {Money(facts.OvertimeEarned)}.";

        if (Asks("сколько смен", "смен ", "смены"))
            return $"Смен за {facts.Period} — {facts.Shifts}, часов {Hours(facts.Hours)}. "
                   + $"Выходных дней {facts.DaysOff}.";

        if (Asks("где", "мест", "заведен"))
            return facts.Places.Length == 0
                ? "Ни одна смена за этот период не привязана к месту работы."
                : Places(facts);

        // The default is the question people ask most: how much.
        var change = Change(facts);

        // A period with nothing in it is a sentence, not a row of zeros.
        if (facts.Shifts == 0)
            return facts.Planned > 0
                ? $"За {facts.Period} отработанных смен нет — в плане {Money(facts.Planned)}."
                : $"За {facts.Period} отработанных смен нет.";

        return $"За {facts.Period} заработано {Money(facts.Earned)} — {Shifts(facts.Shifts)}, {Hours(facts.Hours)}"
               + (facts.Hours < 1 ? "." : $", по {Money(facts.PerHour)} в час.")
               + (change is null ? "" : $" {change}")
               + (facts.Planned > 0 ? $" Ещё {Money(facts.Planned)} в плане." : "");
    }

    /// <summary>The report's own prose, when no model dresses it.</summary>
    public static (string Summary, string[] Paragraphs) Report(AssistantFacts facts)
    {
        var summary = facts.Shifts == 0
            ? $"За {facts.Period} отработанных смен не было."
            : $"За {facts.Period} — {Money(facts.Earned)} за {Shifts(facts.Shifts)} и {Hours(facts.Hours)}"
              + (facts.Hours < 1 ? "." : $", по {Money(facts.PerHour)} в час.");

        var paragraphs = new List<string>();

        if (facts.Shifts == 0)
        {
            paragraphs.Add(
                facts.Planned > 0
                    ? $"В плане на этот период {Money(facts.Planned)} — смены есть, но ни одна ещё не отмечена как отработанная."
                    : "Ни одной смены на этот период не поставлено.");

            return (summary, paragraphs.ToArray());
        }

        var sources = new List<string>();

        if (facts.ShiftsEarned - facts.RevenueEarned > 0)
            sources.Add($"ставка — {Money(facts.ShiftsEarned - facts.RevenueEarned)}");
        if (facts.RevenueEarned > 0)
            sources.Add($"процент — {Money(facts.RevenueEarned)} с выручки {Money(facts.RevenueCounted)}");
        if (facts.PeriodEarned > 0) sources.Add($"оклад — {Money(facts.PeriodEarned)}");
        if (facts.OvertimeEarned > 0) sources.Add($"переработки — {Money(facts.OvertimeEarned)}");
        if (facts.PremiumEarned > 0) sources.Add($"надбавки — {Money(facts.PremiumEarned)}");
        if (facts.SalesEarned > 0) sources.Add($"продажи — {Money(facts.SalesEarned)}");
        if (facts.TipsEarned > 0) sources.Add($"чаевые — {Money(facts.TipsEarned)}");

        paragraphs.Add("Откуда деньги: " + string.Join("; ", sources) + ".");

        if (facts.TipOut > 0 || facts.Deductions > 0)
        {
            var cuts = new List<string>();

            if (facts.TipOut > 0) cuts.Add($"{Money(facts.TipOut)} отдано персоналу");
            if (facts.Deductions > 0) cuts.Add($"{Money(facts.Deductions)} удержано");

            paragraphs.Add("Из этого " + string.Join(" и ", cuts) + ".");
        }

        if (facts.Tax > 0)
            paragraphs.Add($"Налог {Money(facts.Tax)} — на руки остаётся {Money(facts.Net)}.");

        if (facts.BestDayDate is not null)
            paragraphs.Add(
                $"Самый денежный день — {Said(facts.BestDayDate)}, {Money(facts.BestDayAmount)}."
                + (facts.BusiestWeekday is null ? "" : $" Чаще всего вы выходили в {facts.BusiestWeekday}.")
                + (facts.LongestShiftHours > 0 ? $" Самая длинная смена — {Hours((double)facts.LongestShiftHours)}." : ""));

        if (facts.Places.Length > 1)
            paragraphs.Add("По местам: "
                + string.Join(", ", facts.Places
                    .OrderByDescending(place => place.Earned)
                    .Select(place => $"{place.Name} — {Money(place.Earned)}"))
                + ".");

        var change = Change(facts);

        if (change is not null) paragraphs.Add(change);

        if (facts.NightHours > 0)
            paragraphs.Add($"Ночных часов {Hours(facts.NightHours)}"
                + (facts.PremiumEarned > 0 ? $", и надбавка за них — {Money(facts.PremiumEarned)}." : "."));

        return (summary, paragraphs.ToArray());
    }

    /// <summary>
    /// A place's earnings in its own currency. The hryvnia keeps its mark
    /// because that is what everything else on the screen uses; anything else
    /// gets its code, because a number is only money once you know which.
    /// </summary>
    private static string Amount(AssistantPlace place) =>
        place.Currency == "UAH"
            ? Money(place.Earned)
            : $"{Math.Round(place.Earned).ToString("N0", Ru)} {place.Currency}";

    /// <summary>The places, biggest first. The only honest shape when currencies differ.</summary>
    private static string Places(AssistantFacts facts) =>
        facts.Places.Length == 0
            ? "Ни одна смена не привязана к месту работы."
            : "По местам: "
              + string.Join(", ", facts.Places
                  .OrderByDescending(place => place.Earned)
                  .Select(place => $"{place.Name} — {Amount(place)} за {Hours(place.Hours)}"))
              + ".";

    /// <summary>How this period sits against the one before it, when both exist.</summary>
    private static string? Change(AssistantFacts facts)
    {
        if (facts.PreviousEarned <= 0 || facts.Earned <= 0) return null;

        var delta = (double)((facts.Earned - facts.PreviousEarned) / facts.PreviousEarned) * 100;

        if (Math.Abs(delta) < 3) return "Это почти столько же, сколько в прошлый такой же период.";

        return delta > 0
            ? $"Это на {Math.Round(delta)}% больше, чем в прошлый такой же период ({Money(facts.PreviousEarned)})."
            : $"Это на {Math.Round(-delta)}% меньше, чем в прошлый такой же период ({Money(facts.PreviousEarned)}).";
    }

    private static string Share(decimal part, decimal whole) =>
        whole <= 0 ? "неизвестную долю" : $"{Math.Round(part / whole * 100)}%";

    private static string Said(string date)
    {
        if (!DateOnly.TryParse(date, out var parsed)) return date;

        string[] months =
        [
            "января", "февраля", "марта", "апреля", "мая", "июня",
            "июля", "августа", "сентября", "октября", "ноября", "декабря",
        ];

        return $"{parsed.Day} {months[parsed.Month - 1]}";
    }
}
