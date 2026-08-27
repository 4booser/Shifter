namespace Shifter.Application.Features.Assistant;

/// <summary>
/// Which stretch of days a question is about. Without this the assistant
/// answers "сколько я заработал в июле" with August's figures and sounds
/// completely sure of itself, which is worse than not answering at all.
/// </summary>
public static class AssistantPeriod
{
    /// <summary>The day number written immediately before a month name, if any.</summary>
    private static int? DayBefore(string text, string stem)
    {
        var at = text.IndexOf(stem, StringComparison.Ordinal);

        if (at <= 0) return null;

        var end = at - 1;

        while (end >= 0 && text[end] == ' ') end--;

        var start = end;

        while (start >= 0 && char.IsDigit(text[start])) start--;

        if (start == end) return null;

        return int.TryParse(text[(start + 1)..(end + 1)], out var day) && day is >= 1 and <= 31
            ? day
            : null;
    }

    private static readonly string[][] Months =
    [
        ["январ", "січн"],
        ["феврал", "лют"],
        ["март", "березн"],
        ["апрел", "квітн"],
        ["мая", "май", "травн"],
        ["июн", "червн"],
        ["июл", "липн"],
        ["август", "серпн"],
        ["сентябр", "вересн"],
        ["октябр", "жовтн"],
        ["ноябр", "листопад"],
        ["декабр", "грудн"],
    ];

    /// <summary>
    /// The range the question asks about, or the fallback when it names none.
    /// Only the first match counts: a sentence mentioning two months is
    /// ambiguous, and guessing between them is how a wrong answer sounds
    /// confident.
    /// </summary>
    public static (DateOnly From, DateOnly To) Of(
        string question, DateOnly today, DateOnly fallbackFrom, DateOnly fallbackTo)
    {
        var text = (question ?? "").ToLowerInvariant();

        if (text.Contains("вчера") || text.Contains("вчора"))
        {
            var yesterday = today.AddDays(-1);

            return (yesterday, yesterday);
        }

        if (text.Contains("сегодня") || text.Contains("сьогодні")) return (today, today);

        if (text.Contains("недел") || text.Contains("тижд") || text.Contains("тижн"))
        {
            // Monday to Sunday: the week a rota is written in.
            var monday = today.AddDays(-(((int)today.DayOfWeek + 6) % 7));

            return text.Contains("прошл") || text.Contains("минул")
                ? (monday.AddDays(-7), monday.AddDays(-1))
                : (monday, monday.AddDays(6));
        }

        if (text.Contains("прошл") || text.Contains("минул"))
        {
            // "прошлый месяц" and a bare "в прошлом" both mean the month before.
            var first = new DateOnly(today.Year, today.Month, 1).AddMonths(-1);

            return (first, first.AddMonths(1).AddDays(-1));
        }

        if (text.Contains("за год") || text.Contains("в этом году") || text.Contains("за рік"))
            return (new DateOnly(today.Year, 1, 1), new DateOnly(today.Year, 12, 31));

        for (var index = 0; index < Months.Length; index++)
        {
            var stem = Months[index].FirstOrDefault(text.Contains);

            if (stem is null) continue;

            // "24 августа" names a day, not a month, and answering it with the
            // whole month is the same kind of confident wrongness this file
            // exists to prevent.
            var day = DayBefore(text, stem);

            // A month already past this year is that month; a month still
            // ahead is last year's, because nobody asks what they will earn.
            var year = index + 1 > today.Month ? today.Year - 1 : today.Year;

            if (day is int number && number <= DateTime.DaysInMonth(year, index + 1))
            {
                var named = new DateOnly(year, index + 1, number);

                return (named, named);
            }

            var first = new DateOnly(year, index + 1, 1);

            return (first, first.AddMonths(1).AddDays(-1));
        }

        return (fallbackFrom, fallbackTo);
    }
}
