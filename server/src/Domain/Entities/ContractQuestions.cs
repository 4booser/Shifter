namespace Shifter.Domain.Entities;

/// <summary>
/// What to ask before signing, worked out from what the contract does not say.
///
/// People sign these without reading them, and the reason is not laziness: a
/// contract is four pages of language written by somebody else's lawyer, and
/// nobody knows which of it matters. What matters in this trade is a short and
/// unchanging list — how the hours are counted, what happens to the tips, what
/// can be taken off the pay — and the useful thing is not an opinion about the
/// document but a list of what it is silent about.
///
/// So there is no model here and no legal claim. It is a fixed, readable list
/// of topics, matched against the text by looking for the words the topic is
/// always written in. Everything it produces is a question. It never says a
/// term is unfair, unusual or unlawful, because it cannot know that and
/// because a wrong answer to that question costs somebody their job.
///
/// A topic the contract does not mention is the finding. A topic it does
/// mention is left alone — reading the clause is the person's job and telling
/// them what it means would be the thing this refuses to do.
/// </summary>
public static class ContractQuestions
{
    public sealed record Topic(
        /// <summary>A stable key, so the wording can change without the list changing.</summary>
        string Id,
        /// <summary>Words the topic is written in, in any of the three languages.</summary>
        string[] Words);

    /// <summary>
    /// The list, in the order the questions are worth asking. Short on purpose:
    /// a checklist long enough to cover every contract is long enough that
    /// nobody reads the output, and then the two that mattered are lost in it.
    /// </summary>
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

    /// <summary>
    /// The topics this text never mentions.
    ///
    /// Matched on lowercased text with the commonest word endings already cut
    /// off the search terms — Slavic contracts decline everything, and looking
    /// for "удержание" misses "удержаний" in the very sentence that matters.
    /// </summary>
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

    /// <summary>
    /// Shorter than this and it is a fragment, a heading, or somebody testing
    /// the box. Answering it with ten findings would make the feature look
    /// like it says the same thing about everything — which it would be.
    /// </summary>
    public const int MinimumLength = 400;

    /// <summary>
    /// The two topics worth raising even where the contract does mention them.
    ///
    /// Not because a clause about them is suspicious, but because these are the
    /// two that are usually written in a way that is true and incomplete: what
    /// counts as a shortfall, and whose the tips are. Asking is free.
    /// </summary>
    public static readonly string[] AlwaysWorthAsking = ["deductions", "tips"];
}
