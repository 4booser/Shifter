namespace Shifter.Domain.Entities;

/// <summary>What to ask before signing, worked out from what the contract does not say.</summary>
public static class ContractQuestions
{
    public sealed record Topic(
        /// <summary>A stable key, so the wording can change without the list changing.</summary>
        string Id,
        /// <summary>Words the topic is written in, in any of the three languages.</summary>
        string[] Words);

    /// <summary>The list, in the order the questions are worth asking.</summary>
    public static readonly Topic[] Topics =
    [
        new("rate", ["ставка", "оклад", "заработн", "заробітн", "оплата труда", "salary", "wage", "rate per hour", "погодинн"]),
        new("paid_on", ["дата выплаты", "выплачивается", "виплачується", "число каждого месяца", "payment date", "payday", "аванс"]),
        new("hours", ["рабочего времени", "робочого часу", "часов в неделю", "годин на тиждень", "working hours", "график работы", "графік роботи"]),
        new("overtime", ["сверхуроч", "понаднормов", "overtime", "сверх нормы", "додаткові години"]),
        new("tips", ["чаевые", "чайові", "tips", "gratuit", "типы"]),
        new("deductions", ["удержан", "утриман", "штраф", "deduction", "fine", "недостач", "нестач"]),
        new("breaks", ["перерыв", "перерв", "break", "обеденн", "обідн"]),
        new("trial", ["испытательн", "випробувальн", "probation", "trial period"]),
        new("notice", ["расторжен", "розірван", "предупредить за", "notice period", "увольнен", "звільнен"]),
        new("holiday", ["отпуск", "відпустк", "holiday", "vacation", "щорічн"]),
    ];

    /// <summary>The topics this text never mentions.</summary>
    public static IReadOnlyList<string> Missing(string text)
    {
        var lowered = (text ?? string.Empty).ToLowerInvariant();

        // A page of nothing is not a contract with ten omissions in it. Below
        // this the honest answer is that there is nothing here to read.
        if (lowered.Trim().Length < MinimumLength) return [];

        return Topics
            .Where(topic => !topic.Words.Any(word => lowered.Contains(word)))
            .Select(topic => topic.Id)
            .ToArray();
    }

    /// <summary>Shorter than this and it is a fragment, a heading, or somebody testing the box.</summary>
    public const int MinimumLength = 400;

    /// <summary>The two topics worth raising even where the contract does mention them.</summary>
    public static readonly string[] AlwaysWorthAsking = ["deductions", "tips"];
}
