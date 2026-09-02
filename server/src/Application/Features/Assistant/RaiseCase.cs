using System.Globalization;

using Shifter.Application.Features.business.DTOs;
using Shifter.Domain.Entities;

namespace Shifter.Application.Features.Assistant;

/// <summary>
/// The case for a raise, assembled out of somebody's own record.
///
/// People do not fail to ask because they lack nerve. They fail because when
/// the moment comes they have nothing but a feeling, and a feeling loses to
/// "business has been slow" every time. The evidence has been accumulating in
/// this app the whole while: how long since the rate last moved, how this place
/// compares to the others they work, how many shifts they took at short notice
/// for somebody else.
///
/// Nothing here is invented and nothing is exaggerated. A weak case is reported
/// as a weak case — an app that talks somebody into a conversation they will
/// lose has done them harm, not a favour.
/// </summary>
public static class RaiseCase
{
    /// <summary>
    /// Below this there is nothing to say yet. Three months is roughly when a
    /// person stops being new, and asking before that is asking to be told to
    /// wait.
    /// </summary>
    private const int SettledInMonths = 3;

    public static RaiseCaseDto Build(
        Location place,
        LocationTotalDto here,
        LocationTotalDto[] everywhere,
        RaiseDto[] raises,
        int monthsHere,
        int coversTaken,
        DateOnly today)
    {
        List<string> points = [];

        // 1. How long the rate has stood still. The single most persuasive
        //    fact, and the one nobody can produce from memory.
        RaiseDto? last = raises
            .Where(raise => raise.location_name == place.Name)
            .OrderByDescending(raise => raise.on)
            .FirstOrDefault();

        int monthsSince = last is null ? monthsHere : Months(last.on, today);

        if (monthsSince >= 6)
        {
            points.Add(last is null
                ? $"ставка не менялась за все {Plural(monthsHere, "месяц", "месяца", "месяцев")} работы здесь"
                : $"ставка не менялась {Plural(monthsSince, "месяц", "месяца", "месяцев")} — с {last.on:dd.MM.yyyy}");
        }

        // 2. What this place pays against the others they actually work. Not a
        //    market figure — their own, which is the only comparison they can
        //    defend without arguing about somebody else's data.
        LocationTotalDto[] others = everywhere
            .Where(entry => entry.location_id != here.location_id && entry.hours > 0)
            .ToArray();

        if (here.hours > 0 && others.Length > 0)
        {
            decimal best = others.Max(entry => entry.per_hour);

            if (best > here.per_hour && here.per_hour > 0m)
            {
                decimal gap = Math.Round((best - here.per_hour) * 100m / here.per_hour, 0);

                if (gap >= 10m)
                {
                    points.Add($"час здесь на {gap}% ниже, чем в другом месте, где вы работаете");
                }
            }
        }

        // 3. Shifts taken at short notice for somebody else. The favour nobody
        //    writes down, which is exactly why it is worth writing down.
        if (coversTaken > 0)
        {
            points.Add($"вы закрыли {Plural(coversTaken, "смену", "смены", "смен")} за других");
        }

        // 4. The plain weight of the record. Last, because it is the least
        //    pointed of the four and reads as filler if it leads.
        if (here.days_worked >= 30)
        {
            points.Add($"{Plural(here.days_worked, "смена", "смены", "смен")} и {Hours(here.hours)} здесь");
        }

        bool worthAsking = monthsHere >= SettledInMonths && points.Count >= 2;

        return new RaiseCaseDto(
            place.Id,
            place.Name,
            monthsHere,
            monthsSince,
            Math.Round(here.per_hour, 2),
            [.. points],
            worthAsking,
            worthAsking ? Message(place, points) : null,
            Weakness(monthsHere, points.Count));
    }

    /// <summary>
    /// A short message somebody can send as it is, or read once and then say in
    /// their own words. Deliberately not a script: it opens with the ask,
    /// gives the reasons as a list, and stops. Anything longer gets edited into
    /// nothing on the way out of the door.
    /// </summary>
    private static string Message(Location place, List<string> points)
    {
        string reasons = string.Join(";\n— ", points);

        return $"Здравствуйте! Хотел(а) бы обсудить пересмотр ставки.\n\n"
            + $"— {reasons}.\n\n"
            + "Понимаю, что это разговор не на одну минуту — скажите, когда вам удобно.";
    }

    /// <summary>
    /// Why the case is thin, where it is. Said plainly rather than hidden: an
    /// app that talks somebody into a losing conversation has done them harm.
    /// </summary>
    private static string? Weakness(int monthsHere, int points)
    {
        if (monthsHere < SettledInMonths)
        {
            return $"Вы здесь меньше {Plural(SettledInMonths, "месяца", "месяцев", "месяцев")}. "
                + "Просить прибавку сейчас — почти наверняка услышать «давайте позже», и это будет справедливо.";
        }

        if (points < 2)
        {
            return "Пока нет двух вещей, которые можно предъявить. "
                + "Через несколько месяцев или после пары закрытых чужих смен разговор будет другим.";
        }

        return null;
    }

    private static int Months(DateOnly from, DateOnly to)
        => ((to.Year - from.Year) * 12) + to.Month - from.Month;

    /// <summary>
    /// Hours, declined and grouped — this line is copied into a message and
    /// read out to a manager.
    ///
    /// It said «2304 часов»: the word never bent, and the number never got its
    /// space because the default format for a double does not group. Both
    /// wrong in the one sentence somebody rehearses before asking for money.
    /// </summary>
    private static string Hours(double value)
        => Plural((int)Math.Round(value), "час", "часа", "часов");

    /// <summary>Russian declines after a number, and here it is read aloud.</summary>
    private static string Plural(int count, string one, string few, string many)
    {
        int mod100 = count % 100;
        int mod10 = count % 10;

        string word = mod100 is >= 11 and <= 14 ? many
            : mod10 == 1 ? one
            : mod10 is >= 2 and <= 4 ? few
            : many;

        return $"{count.ToString("N0", CultureInfo.GetCultureInfo("ru-RU"))} {word}";
    }
}
