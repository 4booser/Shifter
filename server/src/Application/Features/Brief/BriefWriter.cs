using System.Globalization;

using Shifter.Application.Common.Text;

namespace Shifter.Application.Features.Brief;

/// <summary>
/// The brief in words, written without a model. It is the fallback when no
/// key is configured — and the safety net when the model answers with
/// nonsense — so it has to be genuinely good, not a placeholder. Pure, and
/// therefore testable: the same facts always produce the same page.
/// </summary>
public static class BriefWriter
{
    private static readonly CultureInfo Ru = Figures.Ru;

    public static (string Headline, string Body, string Tip, string Mood) Compose(
        BriefFacts facts,
        string? lang = null)
    {
        var say = Say.In(lang);
        var money = (decimal value) => value.ToString("N0", Ru);

        var headline = facts.ShiftName is null
            ? say.Of("Сегодня выходной", "Сьогодні вихідний")
            : $"{say.Of("Сегодня", "Сьогодні")} {facts.ShiftName} · {facts.ShiftFrom}–{facts.ShiftTo}";

        // Three zeros is not a summary of a month, it is a summary of an empty
        // app — and it was the first sentence anybody read after signing up.
        var body = new List<string>
        {
            facts.MonthShifts == 0
                ? say.Of(
                    "В этом месяце пока ни одной отмеченной смены.",
                    "Цього місяця поки жодної позначеної зміни.")
                : say.Of(
                    $"В этом месяце {facts.MonthShifts} {Telegram.TelegramCommands.Plural(facts.MonthShifts, "смена", "смены", "смен")}, {Math.Round(facts.MonthHours)} ч и {money(facts.MonthEarned)} ₴.",
                    $"Цього місяця {facts.MonthShifts} {Telegram.TelegramCommands.Plural(facts.MonthShifts, "зміна", "зміни", "змін")}, {Math.Round(facts.MonthHours)} год і {money(facts.MonthEarned)} ₴."),
        };

        if (facts.GoalProgress is double progress && facts.Goal is decimal goal)
        {
            var left = Math.Max(0, goal - facts.MonthEarned);

            // A month that closed in the red makes the share of the goal a
            // small negative, and rounding it lands on negative zero: the
            // day's summary read «осталось 40 156 ₴ (-0%)». Nothing has been
            // put towards a goal here, and that is nought per cent.
            var share = Math.Max(0, Math.Round(progress * 100));

            body.Add(progress >= 1
                ? say.Of(
                    $"Цель {money(goal)} ₴ уже взята — дальше всё сверху.",
                    $"Ціль {money(goal)} ₴ уже взята — далі все зверху.")
                : say.Of(
                    $"До цели {money(goal)} ₴ осталось {money(left)} ₴ ({share}%).",
                    $"До цілі {money(goal)} ₴ лишилося {money(left)} ₴ ({share}%)."));
        }
        else if (facts.ProjectedMonth > facts.MonthEarned)
        {
            body.Add(say.Of(
                $"Такими темпами к концу месяца выйдет около {money(facts.ProjectedMonth)} ₴.",
                $"Такими темпами до кінця місяця вийде близько {money(facts.ProjectedMonth)} ₴."));
        }

        if (facts.StreakDays >= 3)
        {
            body.Add(say.Of(
                $"Серия: {facts.StreakDays} {Telegram.TelegramCommands.Plural(facts.StreakDays, "день", "дня", "дней")} подряд со сменами.",
                $"Серія: {facts.StreakDays} {Telegram.TelegramCommands.Plural(facts.StreakDays, "день", "дні", "днів")} поспіль зі змінами."));
        }

        if (facts.DaysToPayday is int days && facts.PaydayAmount is decimal amount && amount > 0)
        {
            body.Add(days == 0
                ? say.Of(
                    $"Сегодня день выплаты — ждём около {money(amount)} ₴.",
                    $"Сьогодні день виплати — чекаємо близько {money(amount)} ₴.")
                : say.Of(
                    $"Ближайшие деньги через {days} дн.: около {money(amount)} ₴.",
                    $"Найближчі гроші через {days} дн.: близько {money(amount)} ₴."));
        }

        var tip = Tip(facts, money, say);
        var mood = facts.ShiftName is null ? "🌤️" : facts.StreakDays >= 4 ? "🔥" : "💪";

        return (headline, string.Join(' ', body), tip, mood);
    }

    private static string Tip(BriefFacts facts, Func<decimal, string> money, Say say)
    {
        // Nothing recorded anywhere is a different situation from a quiet day,
        // and the advice for it is the only advice that applies: there is
        // nothing to check, so say where to start instead.
        if (facts.MonthShifts == 0 && facts.BestDayAmount == 0 && facts.MonthEarned == 0)
            return say.Of(
                "Отметьте свои смены на календаре — дальше приложение посчитает само.",
                "Позначте свої зміни в календарі — далі застосунок порахує сам.");

        // Today first: advice about the day in hand beats a fact about the
        // month, however interesting the fact is.
        if (facts.Highlights.Length > 0) return facts.Highlights[0];

        if (facts.ShiftName is null)
            return say.Of(
                "Выходной — хороший день, чтобы проверить, все ли смены недели отмечены.",
                "Вихідний — добрий день, щоб перевірити, чи всі зміни тижня позначені.");

        if (facts.TipsShare >= 0.2m)
            return say.Of(
                $"Чаевые дают {Math.Round(facts.TipsShare * 100)}% дохода — вносите их в тот же вечер, пока помните.",
                $"Чайові дають {Math.Round(facts.TipsShare * 100)}% доходу — вносьте їх того самого вечора, поки пам’ятаєте.");

        if (facts.BestDayAmount > 0 && facts.BestDayDate is not null)
            return say.Of(
                $"Лучший день месяца — {facts.BestDayDate}: {money(facts.BestDayAmount)} ₴. Посмотрите, что тогда совпало.",
                $"Найкращий день місяця — {facts.BestDayDate}: {money(facts.BestDayAmount)} ₴. Подивіться, що тоді збіглося.");

        return say.Of(
            "Отметьте чаевые сразу после смены: через день цифра всегда врёт.",
            "Позначайте чайові одразу після зміни: за день цифра завжди бреше.");
    }
}
