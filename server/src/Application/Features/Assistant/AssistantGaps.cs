using Shifter.Application.Common.Text;
using Shifter.Application.Features.business.DTOs;

namespace Shifter.Application.Features.Assistant;

/// <summary>
/// What the assistant does not know and could simply ask. Every gap here is a
/// hole in somebody's own record, not a preference survey: a worked day with
/// no tips, a percentage shift with no takings, a pool with no amount. The
/// point is that answering one improves the arithmetic on every screen —
/// asking questions that change nothing is how an assistant becomes noise.
/// </summary>
public static class AssistantGaps
{
    /// <summary>
    /// A question and everything needed to write the answer back. Kind decides
    /// which field the answer lands in; nothing else about it is guessed.
    /// </summary>
    public sealed record Gap(
        string id,
        string kind,
        string question,
        string date,
        int? shift_id,
        string? shift_name,
        /// <summary>A figure worth offering as the first tap, when one exists.</summary>
        decimal? suggestion);

    /// <summary>How many to raise at once. More than a handful reads as a chore.</summary>
    public const int Limit = 6;

    public static Gap[] Find(DayDto[] days, DateOnly today, string? lang = null)
    {
        var say = Say.In(lang);
        var gaps = new List<Gap>();

        // Newest first: this week's blanks are the ones somebody can still
        // remember the answer to.
        foreach (var day in days.Where(day => day.date < today.AddDays(1)).OrderByDescending(day => day.date))
        {
            var worked = day.shifts.Where(shift => shift.worked).ToArray();

            if (worked.Length == 0) continue;

            foreach (var shift in worked.Where(shift => shift.revenue_percent is > 0m && shift.revenue is null))
                gaps.Add(new Gap(
                    $"revenue-{day.date:yyyy-MM-dd}-{shift.shift_id}",
                    "revenue",
                    say.Of(
                        $"{Said(day.date, say)} вы работали «{shift.name}» под {Percent(shift.revenue_percent!.Value)}% от выручки, но выручка не записана. Сколько было?",
                        $"{Said(day.date, say)} ви працювали «{shift.name}» під {Percent(shift.revenue_percent!.Value)}% від виторгу, але виторг не записано. Скільки було?"),
                    day.date.ToString("yyyy-MM-dd"),
                    shift.shift_id,
                    shift.name,
                    null));

            // Tips are asked only where the day is genuinely blank: a zero
            // somebody typed is an answer, and re-asking it is nagging.
            if (day.tips is null && day.tip_pool is null)
                gaps.Add(new Gap(
                    $"tips-{day.date:yyyy-MM-dd}",
                    "tips",
                    say.Of(
                        $"{Said(day.date, say)} смена была, а чаевые не отмечены. Сколько вышло?",
                        $"{Said(day.date, say)} зміна була, а чайові не позначено. Скільки вийшло?"),
                    day.date.ToString("yyyy-MM-dd"),
                    null,
                    null,
                    null));
        }

        return gaps.Take(Limit).ToArray();
    }

    /// <summary>A percentage without the trailing zeros nobody says out loud.</summary>
    private static string Percent(decimal value) =>
        value == Math.Truncate(value) ? ((int)value).ToString() : value.ToString("0.##");

    private static string Said(DateOnly date, Say say)
    {
        string[] ru =
        [
            "января", "февраля", "марта", "апреля", "мая", "июня",
            "июля", "августа", "сентября", "октября", "ноября", "декабря",
        ];
        string[] uk =
        [
            "січня", "лютого", "березня", "квітня", "травня", "червня",
            "липня", "серпня", "вересня", "жовтня", "листопада", "грудня",
        ];

        return $"{date.Day} {(say.IsUk ? uk : ru)[date.Month - 1]}";
    }
}
