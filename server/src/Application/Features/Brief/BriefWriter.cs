using System.Globalization;

namespace Shifter.Application.Features.Brief;

/// <summary>
/// The brief in words, written without a model. It is the fallback when no
/// key is configured — and the safety net when the model answers with
/// nonsense — so it has to be genuinely good, not a placeholder. Pure, and
/// therefore testable: the same facts always produce the same page.
/// </summary>
public static class BriefWriter
{
    private static readonly CultureInfo Ru = CultureInfo.GetCultureInfo("ru-RU");

    public static (string Headline, string Body, string Tip, string Mood) Compose(BriefFacts facts)
    {
        var money = (decimal value) => value.ToString("N0", Ru).Replace(',', ' ');

        var headline = facts.ShiftName is null
            ? "Сегодня выходной"
            : $"Сегодня {facts.ShiftName} · {facts.ShiftFrom}–{facts.ShiftTo}";

        var body = new List<string>
        {
            $"В этом месяце {facts.MonthShifts} смен, {Math.Round(facts.MonthHours)} ч и {money(facts.MonthEarned)} ₴.",
        };

        if (facts.GoalProgress is double progress && facts.Goal is decimal goal)
        {
            var left = Math.Max(0, goal - facts.MonthEarned);

            body.Add(progress >= 1
                ? $"Цель {money(goal)} ₴ уже взята — дальше всё сверху."
                : $"До цели {money(goal)} ₴ осталось {money(left)} ₴ ({Math.Round(progress * 100)}%).");
        }
        else if (facts.ProjectedMonth > facts.MonthEarned)
        {
            body.Add($"Такими темпами к концу месяца выйдет около {money(facts.ProjectedMonth)} ₴.");
        }

        if (facts.StreakDays >= 3) body.Add($"Серия: {facts.StreakDays} дня подряд со сменами.");

        if (facts.DaysToPayday is int days && facts.PaydayAmount is decimal amount && amount > 0)
        {
            body.Add(days == 0
                ? $"Сегодня день выплаты — ждём около {money(amount)} ₴."
                : $"Ближайшие деньги через {days} дн.: около {money(amount)} ₴.");
        }

        var tip = Tip(facts, money);
        var mood = facts.ShiftName is null ? "🌤️" : facts.StreakDays >= 4 ? "🔥" : "💪";

        return (headline, string.Join(' ', body), tip, mood);
    }

    private static string Tip(BriefFacts facts, Func<decimal, string> money)
    {
        // Today first: advice about the day in hand beats a fact about the
        // month, however interesting the fact is.
        if (facts.Highlights.Length > 0) return facts.Highlights[0];

        if (facts.ShiftName is null)
            return "Выходной — хороший день, чтобы проверить, все ли смены недели отмечены.";

        if (facts.TipsShare >= 0.2m)
            return $"Чаевые дают {Math.Round(facts.TipsShare * 100)}% дохода — вносите их в тот же вечер, пока помните.";

        if (facts.BestDayAmount > 0 && facts.BestDayDate is not null)
            return $"Лучший день месяца — {facts.BestDayDate}: {money(facts.BestDayAmount)} ₴. Посмотрите, что тогда совпало.";

        return "Отметьте чаевые сразу после смены: через день цифра всегда врёт.";
    }
}
