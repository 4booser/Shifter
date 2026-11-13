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
          h1,.person b,.day .group{overflow-wrap:anywhere}
          .month{color:#6f6a5e;font-weight:600;margin:0 0 .75rem}
          .venue{color:#6f6a5e;font-size:.9rem;margin:-.5rem 0 .75rem}
          .venue span{white-space:nowrap}
          .turn{display:flex;justify-content:space-between;gap:1rem;margin:0 0 1.25rem}
          .sheet{display:none;overflow-x:auto;position:relative}
          .sheet table{border-collapse:separate;border-spacing:0;font-size:.72rem;min-width:calc(7.5rem + 31*2.25rem);table-layout:fixed;width:100%}
          .sheet th,.sheet td{border-bottom:1px solid #e3ded2;min-width:2.1rem;padding:.35rem .08rem;text-align:center}
          .sheet thead th{font-weight:600}
          .sheet small{color:#6f6a5e;display:block;font-size:.68rem;font-weight:400}
          .sheet .who{background:#f4f2ed;left:0;width:7.5rem;overflow-wrap:anywhere;padding-right:.5rem;position:sticky;text-align:left;z-index:1}
          .sheet .mon{border-left:1px solid #cfc9ba}
          .sheet .we{background-color:rgba(74,68,200,.07)}
          .sheet .shut{background-image:repeating-linear-gradient(135deg,rgba(111,106,94,.13) 0 3px,transparent 3px 7px)}
          .sheet thead .shut{color:#a7a196}
          .sheet .group th,.sheet .group td{background:#f4f2ed;color:#6f6a5e;font-size:.68rem;font-weight:600;padding:.2rem .5rem}
          .sheet .today{box-shadow:inset 2px 0 0 #4a44c8,inset -2px 0 0 #4a44c8}
          .sheet thead .today{box-shadow:inset 2px 0 0 #4a44c8,inset -2px 0 0 #4a44c8,inset 0 2px 0 #4a44c8}
          .sheet tbody tr:last-child .today{box-shadow:inset 2px 0 0 #4a44c8,inset -2px 0 0 #4a44c8,inset 0 -2px 0 #4a44c8}
          .dot{border-radius:50%;display:inline-block;flex:none;height:.6rem;margin-right:.4rem;width:.6rem}
          .bare{border-radius:50%;display:inline-block;height:.45rem;width:.45rem}
          .sr{clip:rect(0 0 0 0);height:1px;overflow:hidden;position:absolute;width:1px}
          .day h2{font-size:1rem;margin:1.25rem 0 .25rem}
          .day.now h2{color:#4a44c8}
          .day.shut h2{color:#a7a196}
          .day ul{margin:0}
          .day .group{color:#6f6a5e;font-size:.75rem;font-weight:600;list-style:none;margin-top:.35rem}
          .person{align-items:baseline;display:flex;flex-wrap:wrap;gap:0 .4rem}
          .person .dot{align-self:center;margin-right:0}
          .hours{font-variant-numeric:tabular-nums;margin-left:auto;white-space:nowrap}
          .past{margin-top:1.5rem}
          .past summary{color:#6f6a5e;cursor:pointer}
          @media (min-width:48rem){
            .sheet{display:block}
            .days{display:none}
          }
          @media (prefers-color-scheme:dark){
            .month,.venue,.sheet small,.day .group,.past summary{color:#a7a196}
            .sheet th,.sheet td{border-bottom-color:#2f2e2a}
            .sheet .who{background:#17171a}
            .sheet .shut{background-image:repeating-linear-gradient(135deg,rgba(167,161,150,.12) 0 3px,transparent 3px 7px)}
            .sheet thead .shut,.day.shut h2{color:#6f6a5e}
            .sheet .group th,.sheet .group td{background:#17171a;color:#a7a196}
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
        int people = roster.Groups.Sum(group => group.People.Length);
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

        bool empty = roster.Groups.All(group => group.People.All(person => person.Shifts.Length == 0));
        string[] venue = RosterRules.VenueRuns(roster.Venue, uk);

        var body = $"""
            <h1>{Escape(roster.Title)}</h1>
            <p class="month">{Escape(shown)}</p>
            {(venue.Length == 0 ? "" : $"<p class=\"venue\">{(uk ? "Години роботи" : "Часы работы")}: {Venue(venue)}</p>")}
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

    /// <summary>The wide view: everybody by every day, under their positions when the roster has any.</summary>
    private static string Sheet(RosterPageRead roster, DateOnly[] days, DateOnly today, bool uk)
    {
        var html = new StringBuilder("<div class=\"sheet\"><table><thead><tr><th class=\"who\"></th>");
        var marks = days.ToDictionary(day => day, day => Marks(day, today, RosterRules.OpenOn(roster.Venue, day)));

        foreach (DateOnly day in days)
        {
            html.Append($"<th scope=\"col\"{marks[day]}>");
            html.Append($"<small>{Weekday(day, uk)}</small>{day.Day}</th>");
        }

        html.Append("</tr></thead><tbody>");

        foreach (RosterPageGroup group in roster.Groups)
        {
            // The group row says the position, so nobody's name repeats it.
            if (Positioned(roster))
            {
                html.Append($"<tr class=\"group\"><th scope=\"rowgroup\" class=\"who\">{GroupName(group, uk)}</th>");
                html.Append($"<td colspan=\"{days.Length}\"></td></tr>");
            }

            foreach (RosterPagePerson person in group.People)
            {
                string colour = Colour(person);
                var worked = person.Shifts.ToDictionary(shift => shift.Date);

                html.Append($"<tr><th scope=\"row\" class=\"who\">{Dot(colour)}{Escape(person.Name)}</th>");

                foreach (DateOnly day in days)
                {
                    if (!worked.TryGetValue(day, out var shift))
                    {
                        html.Append($"<td{marks[day]}></td>");

                        continue;
                    }

                    html.Append($"<td{marks[day]} style=\"background-color:{colour}33\">");
                    html.Append(shift.Start is TimeOnly start && shift.End is TimeOnly end
                        ? Escape(RosterRules.Compact(start, end))
                        : $"<i class=\"bare\" style=\"background:{colour}\"></i>{Bare(uk)}");
                    html.Append("</td>");
                }

                html.Append("</tr>");
            }
        }

        return html.Append("</tbody></table></div>").ToString();
    }

    /// <summary>The phone view. In the month being lived through today leads and the days gone fold away, because what a phone is opened for is the next shift.</summary>
    private static string Days(
        RosterPageRead roster, DateOnly[] days, DateOnly today, bool uk, CultureInfo culture)
    {
        // Group by group, and within a group the earliest start first and the
        // days with no set time last; OrderBy keeps people order among equals.
        var working = roster.Groups
            .SelectMany((group, at) => group.People.SelectMany(
                person => person.Shifts.Select(shift => (Group: at, Person: person, Shift: shift))))
            .OrderBy(entry => entry.Group)
            .ThenBy(entry => entry.Shift.Start is null)
            .ThenBy(entry => entry.Shift.Start)
            .ToLookup(entry => entry.Shift.Date);

        string Day(DateOnly day)
        {
            bool open = RosterRules.OpenOn(roster.Venue, day);
            string name = $"{Weekday(day, uk)}, {Escape(day.ToString("d MMMM", culture))}"
                + (open ? "" : uk ? " · зачинено" : " · закрыто");
            string word = uk ? "Сьогодні" : "Сегодня";
            string shut = open ? "" : " shut";

            var rows = new StringBuilder();
            int? heading = null;

            foreach (var entry in working[day])
            {
                if (Positioned(roster) && entry.Group != heading)
                {
                    rows.Append($"<li class=\"group\">{GroupName(roster.Groups[entry.Group], uk)}</li>");
                    heading = entry.Group;
                }

                rows.Append($"<li class=\"person\">{Dot(Colour(entry.Person))}<b>{Escape(entry.Person.Name)}</b>");
                rows.Append($"<span class=\"hours\">{Hours(entry.Shift, uk)}</span></li>");
            }

            return day == today
                ? $"<section class=\"day now{shut}\"><h2>{word} · {name}</h2><ul>{rows}</ul></section>"
                : $"<section class=\"day{shut}\"><h2>{name}</h2><ul>{rows}</ul></section>";
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

    /// <summary>What sets a day apart. Monday opens a week in both languages, so that is where the rule falls; a day the venue is closed is hatched.</summary>
    private static string Marks(DateOnly day, DateOnly today, bool open)
    {
        var marks = new List<string>();

        if (day.DayOfWeek == DayOfWeek.Monday) marks.Add("mon");
        if (day.DayOfWeek is DayOfWeek.Saturday or DayOfWeek.Sunday) marks.Add("we");
        if (day == today) marks.Add("today");
        if (!open) marks.Add("shut");

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

    /// <summary>A day with no set time says nothing a reader sees: the dot beside the name already says they work.</summary>
    private static string Hours(RosterPageShift shift, bool uk)
        => shift.Start is TimeOnly start && shift.End is TimeOnly end
            ? Escape(RosterRules.Compact(start, end))
            : Bare(uk);

    /// <summary>Out of sight, not out of the layout: .sr is placed absolutely, so the sheet is positioned for it to be placed against. Placed against the page instead, one far along the month would sit out past the table's scroll and widen the whole page.</summary>
    private static string Bare(bool uk) => $"<span class=\"sr\">{(uk ? "без часу" : "без времени")}</span>";

    /// <summary>The venue line with each run of days kept whole and its dot at the end of the one before, so a phone breaks it only after a dot: never «Пт–» on one line and «Сб» on the next. Read without its tags it is the line every screen shows.</summary>
    private static string Venue(string[] runs)
        => string.Join(' ', runs.Select((run, at) => $"<span>{Escape(run)}{(at < runs.Length - 1 ? " ·" : "")}</span>"));

    /// <summary>Without positions there are no groups to name, and the page reads as it always did.</summary>
    private static bool Positioned(RosterPageRead roster) => roster.Groups.Any(group => group.Position is not null);

    private static string GroupName(RosterPageGroup group, bool uk)
        => group.Position is null ? uk ? "Без посади" : "Без должности" : Escape(group.Position);

    /// <summary>Checked again here though the write already did: this goes into a style attribute, and an escaped value is not a safe one there.</summary>
    private static string Colour(RosterPagePerson person)
        => RosterRules.IsColour(person.Colour) ? person.Colour : RosterRules.NeutralColour;

    private static string Dot(string colour)
        => $"<i class=\"dot\" style=\"background:{colour}\"></i>";

    private static string Capital(string text, CultureInfo culture)
        => text.Length == 0 ? text : char.ToUpper(text[0], culture) + text[1..];

    private static string Escape(string value) => WebUtility.HtmlEncode(value);
}
