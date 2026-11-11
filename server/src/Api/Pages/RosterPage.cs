using System.Globalization;
using System.Net;
using System.Text;

using Shifter.Application.Common.Text;
using Shifter.Application.Features.Rosters;
using Shifter.Application.Features.Telegram;

namespace Shifter.Api.Pages;

/// <summary>A roster as a crew reads it: the same month twice, a table for a wide screen and a list for a phone, with CSS choosing between them.</summary>
internal static class RosterPage
{
    /// <summary>The roster's own look, on top of the shell's.</summary>
    private const string Style = """
        <style>
          h1,.person b,.post{overflow-wrap:anywhere}
          .month{color:#6f6a5e;font-weight:600;margin:0 0 .75rem}
          .turn{display:flex;justify-content:space-between;gap:1rem;margin:0 0 1.25rem}
          .sheet{display:none;overflow-x:auto}
          .sheet table{border-collapse:separate;border-spacing:0;font-size:.72rem;min-width:calc(7.5rem + 31*2.25rem);table-layout:fixed;width:100%}
          .sheet th,.sheet td{border-bottom:1px solid #e3ded2;min-width:2.1rem;padding:.35rem .08rem;text-align:center}
          .sheet thead th{font-weight:600}
          .sheet small{color:#6f6a5e;display:block;font-size:.68rem;font-weight:400}
          .sheet .who{background:#f4f2ed;left:0;width:7.5rem;overflow-wrap:anywhere;padding-right:.5rem;position:sticky;text-align:left;z-index:1}
          .sheet .mon{border-left:1px solid #cfc9ba}
          .sheet .we{background-color:rgba(74,68,200,.07)}
          .sheet .today{box-shadow:inset 2px 0 0 #4a44c8,inset -2px 0 0 #4a44c8}
          .sheet thead .today{box-shadow:inset 2px 0 0 #4a44c8,inset -2px 0 0 #4a44c8,inset 0 2px 0 #4a44c8}
          .sheet tbody tr:last-child .today{box-shadow:inset 2px 0 0 #4a44c8,inset -2px 0 0 #4a44c8,inset 0 -2px 0 #4a44c8}
          .dot{border-radius:50%;display:inline-block;flex:none;height:.6rem;margin-right:.4rem;width:.6rem}
          .day h2{font-size:1rem;margin:1.25rem 0 .25rem}
          .day.now h2{color:#4a44c8}
          .day ul{margin:0}
          .person{align-items:baseline;display:flex;flex-wrap:wrap;gap:0 .4rem}
          .person .dot{align-self:center;margin-right:0}
          .post{color:#6f6a5e;font-size:.85rem}
          .hours{font-variant-numeric:tabular-nums;margin-left:auto;white-space:nowrap}
          .past{margin-top:1.5rem}
          .past summary{color:#6f6a5e;cursor:pointer}
          @media (min-width:48rem){
            .sheet{display:block}
            .days{display:none}
          }
          @media (prefers-color-scheme:dark){
            .month,.sheet small,.post,.past summary{color:#a7a196}
            .sheet th,.sheet td{border-bottom-color:#2f2e2a}
            .sheet .who{background:#17171a}
            .sheet .mon{border-left-color:#45433d}
            .sheet .we{background-color:rgba(169,164,255,.09)}
            .sheet .today{box-shadow:inset 2px 0 0 #a9a4ff,inset -2px 0 0 #a9a4ff}
            .sheet thead .today{box-shadow:inset 2px 0 0 #a9a4ff,inset -2px 0 0 #a9a4ff,inset 0 2px 0 #a9a4ff}
            .sheet tbody tr:last-child .today{box-shadow:inset 2px 0 0 #a9a4ff,inset -2px 0 0 #a9a4ff,inset 0 -2px 0 #a9a4ff}
            .day.now h2{color:#a9a4ff}
          }
        </style>
        """;

    /// <summary>The month at its link, in the reader's language.</summary>
    internal static string Month(bool uk, string origin, string slug, RosterPageRead roster)
    {
        var culture = uk ? Figures.Uk : Figures.Ru;
        (DateOnly month, DateOnly today) = (roster.Month, roster.Today);

        string shown = Capital(month.ToString("MMMM yyyy", culture), culture);
        int people = roster.People.Length;
        string word = uk
            ? TelegramCommands.Plural(people, "людина", "людини", "людей")
            : TelegramCommands.Plural(people, "человек", "человека", "человек");
        string description = $"{shown} · {people} {word}";

        var head = $"""
            <meta name="robots" content="noindex">
            <meta name="description" content="{Escape(description)}">
            <meta property="og:type" content="website">
            <meta property="og:site_name" content="Shifter">
            <meta property="og:title" content="{Escape(roster.Title)}">
            <meta property="og:description" content="{Escape(description)}">
            <meta property="og:image" content="{Escape($"{origin}/icons/icon-512.png")}">
            <meta property="og:url" content="{Escape($"{origin}/r/{slug}")}">
            {Style}
            """;

        DateOnly[] days = Enumerable
            .Range(0, DateTime.DaysInMonth(month.Year, month.Month))
            .Select(month.AddDays)
            .ToArray();

        bool empty = roster.People.All(person => person.Shifts.Length == 0);

        var body = $"""
            <h1>{Escape(roster.Title)}</h1>
            <p class="month">{Escape(shown)}</p>
            {Turn(slug, month, culture)}
            {(empty
                ? $"<p class=\"lede\">{(uk ? "У цьому місяці змін поки немає." : "В этом месяце смен пока нет.")}</p>"
                : Sheet(roster, days, today, uk) + Days(roster, days, today, uk, culture))}
            """;

        return PublicPage.Render(
            uk,
            $"{Escape(roster.Title)} — {Escape(shown)} · Shifter",
            head,
            body,
            Footer(uk),
            wide: true);
    }

    /// <summary>The one answer for a link that opens nothing, whatever the reason, so a stranger cannot tell which it was.</summary>
    internal static string Gone(bool uk)
        => PublicPage.Render(
            uk,
            $"{(uk ? "Графік недоступний" : "График недоступен")} · Shifter",
            "<meta name=\"robots\" content=\"noindex\">",
            $"""
            <h1>{(uk ? "Цей графік більше не доступний" : "Этот график больше не доступен")}</h1>
            <p class="lede">{(uk
                ? "Попросіть нове посилання в того, хто складає графік."
                : "Попросите новую ссылку у того, кто составляет график.")}</p>
            """,
            Footer(uk));

    private static string Footer(bool uk) => uk ? "Складено в" : "Составлено в";

    private static string Turn(string slug, DateOnly month, CultureInfo culture)
    {
        DateOnly back = month.AddMonths(-1);
        DateOnly next = month.AddMonths(1);

        string Link(DateOnly target, string text)
            => $"<a href=\"/r/{Escape(slug)}?month={target:yyyy-MM}\">{text}</a>";

        return "<nav class=\"turn\">"
            + (month > RosterRules.FirstMonth
                ? Link(back, $"← {Escape(Capital(back.ToString("MMMM", culture), culture))}")
                : "<span></span>")
            + (month < RosterRules.LastMonth
                ? Link(next, $"{Escape(Capital(next.ToString("MMMM", culture), culture))} →")
                : "<span></span>")
            + "</nav>";
    }

    /// <summary>The wide view: everybody by every day.</summary>
    private static string Sheet(RosterPageRead roster, DateOnly[] days, DateOnly today, bool uk)
    {
        var html = new StringBuilder("<div class=\"sheet\"><table><thead><tr><th class=\"who\"></th>");

        foreach (DateOnly day in days)
        {
            html.Append($"<th scope=\"col\"{Marks(day, today)}>");
            html.Append($"<small>{Weekday(day, uk)}</small>{day.Day}</th>");
        }

        html.Append("</tr></thead><tbody>");

        foreach (RosterPagePerson person in roster.People)
        {
            string colour = Colour(person);
            var worked = person.Shifts.ToDictionary(shift => shift.Date);

            html.Append($"<tr><th scope=\"row\" class=\"who\">{Dot(colour)}{Escape(person.Name)}");

            if (person.Position is not null) html.Append($"<small>{Escape(person.Position)}</small>");

            html.Append("</th>");

            foreach (DateOnly day in days)
            {
                html.Append(worked.TryGetValue(day, out var shift)
                    ? $"<td{Marks(day, today)} style=\"background-color:{colour}33\">{Hours(shift)}</td>"
                    : $"<td{Marks(day, today)}></td>");
            }

            html.Append("</tr>");
        }

        return html.Append("</tbody></table></div>").ToString();
    }

    /// <summary>The phone view. In the month being lived through today leads and the days gone fold away, because what a phone is opened for is the next shift.</summary>
    private static string Days(
        RosterPageRead roster, DateOnly[] days, DateOnly today, bool uk, CultureInfo culture)
    {
        var working = roster.People
            .SelectMany(person => person.Shifts.Select(shift => (Person: person, Shift: shift)))
            .OrderBy(entry => entry.Shift.Start)
            .ToLookup(entry => entry.Shift.Date);

        string Day(DateOnly day)
        {
            string name = $"{Weekday(day, uk)}, {Escape(day.ToString("d MMMM", culture))}";
            string word = uk ? "Сьогодні" : "Сегодня";

            var rows = working[day].Select(entry =>
                $"<li class=\"person\">{Dot(Colour(entry.Person))}<b>{Escape(entry.Person.Name)}</b>"
                + (entry.Person.Position is null ? "" : $"<span class=\"post\">{Escape(entry.Person.Position)}</span>")
                + $"<span class=\"hours\">{Hours(entry.Shift)}</span></li>");

            return day == today
                ? $"<section class=\"day now\"><h2>{word} · {name}</h2><ul>{string.Concat(rows)}</ul></section>"
                : $"<section class=\"day\"><h2>{name}</h2><ul>{string.Concat(rows)}</ul></section>";
        }

        DateOnly[] listed = days.Where(day => working.Contains(day)).ToArray();

        // Today only falls inside the month being lived through, so any other
        // month has no past to fold and runs in date order.
        DateOnly[] gone = days.Contains(today) ? listed.Where(day => day < today).ToArray() : [];

        string past = gone.Length == 0
            ? ""
            : $"<details class=\"past\"><summary>{(uk ? "Минулі дні" : "Прошедшие дни")} · {gone.Length}</summary>"
                + string.Concat(gone.Select(Day))
                + "</details>";

        return $"<div class=\"days\">{string.Concat(listed.Except(gone).Select(Day))}{past}</div>";
    }

    /// <summary>What sets a day apart. Monday opens a week in both languages, so that is where the rule falls.</summary>
    private static string Marks(DateOnly day, DateOnly today)
    {
        var marks = new List<string>();

        if (day.DayOfWeek == DayOfWeek.Monday) marks.Add("mon");
        if (day.DayOfWeek is DayOfWeek.Saturday or DayOfWeek.Sunday) marks.Add("we");
        if (day == today) marks.Add("today");

        return marks.Count == 0 ? "" : $" class=\"{string.Join(' ', marks)}\"";
    }

    /// <summary>Written out rather than read from the culture, which capitalises one language and not the other and may change its mind with the ICU build.</summary>
    private static string Weekday(DateOnly day, bool uk) => day.DayOfWeek switch
    {
        DayOfWeek.Monday => "пн",
        DayOfWeek.Tuesday => "вт",
        DayOfWeek.Wednesday => "ср",
        DayOfWeek.Thursday => "чт",
        DayOfWeek.Friday => "пт",
        DayOfWeek.Saturday => "сб",
        _ => uk ? "нд" : "вс",
    };

    private static string Hours(RosterPageShift shift)
        => Escape(RosterRules.Compact(shift.Start, shift.End));

    /// <summary>Checked again here though the write already did: this goes into a style attribute, and an escaped value is not a safe one there.</summary>
    private static string Colour(RosterPagePerson person)
        => RosterRules.IsColour(person.Colour) ? person.Colour : RosterRules.NeutralColour;

    private static string Dot(string colour)
        => $"<i class=\"dot\" style=\"background:{colour}\"></i>";

    private static string Capital(string text, CultureInfo culture)
        => text.Length == 0 ? text : char.ToUpper(text[0], culture) + text[1..];

    private static string Escape(string value) => WebUtility.HtmlEncode(value);
}
