using Shifter.Application.Features.business.DTOs;
using Shifter.Domain.Entities;

namespace Shifter.Application.Features.business.Services;

/// <summary>A biography made of shifts.</summary>
public static class WorkHistory
{
    public static WorkHistoryDto Of(
        Day[] days,
        Dictionary<int, Location> locations,
        DateOnly today,
        bool withMoney)
    {
        var placed = days
            .SelectMany(day => (day.Shifts ?? []).Select(entry => (day.Date, Entry: entry)))
            .Where(pair => pair.Entry.Worked)
            .ToArray();

        if (placed.Length == 0)
        {
            return new WorkHistoryDto(0, 0, 0, null, null, [], [], []);
        }

        DateOnly first = placed.Min(pair => pair.Date);
        DateOnly last = placed.Max(pair => pair.Date);

        var places = placed
            .GroupBy(pair => pair.Entry.Shift?.LocationId ?? 0)
            .Select(group =>
            {
                locations.TryGetValue(group.Key, out Location? place);

                double hours = group.Sum(pair => pair.Entry.PaidDuration.TotalHours);
                decimal earned = group.Sum(pair => pair.Entry.Pay);

                return new WorkHistoryPlaceDto(
                    // A place somebody has deleted still shows the work: the
                    // history is about the person, not about the record. The
                    // name comes back empty rather than as a dash — a bare "—"
                    // in the place column reads as a broken row, and only the
                    // client knows how to say "no place set" in the reader's
                    // language.
                    place?.Name ?? string.Empty,
                    group.Min(pair => pair.Date).ToString("yyyy-MM"),
                    group.Max(pair => pair.Date).ToString("yyyy-MM"),
                    group.Count(),
                    Math.Round(hours, 0),
                    // The rate, not the total: what somebody was worth an hour
                    // is the number an employer reads, and the total is nobody
                    // else's business.
                    withMoney && hours > 0 ? Math.Round(earned / (decimal)hours, 0) : null,
                    place?.Currency ?? string.Empty);
            })
            .OrderByDescending(place => place.shifts)
            .ToArray();

        // The names of the shifts somebody actually worked are the closest
        // thing this app has to a job title — "Бар", "Кухня", "Закрытие" — and
        // they were typed by the person themselves.
        string[] roles = placed
            .Select(pair => pair.Entry.Shift?.Name ?? string.Empty)
            .Where(name => name.Length > 0)
            .GroupBy(name => name)
            .OrderByDescending(group => group.Count())
            .Take(6)
            .Select(group => group.Key)
            .ToArray();

        // Помесячно — то, что спрашивает бухгалтер и новый работодатель:
        // сколько дней реально отстояно, во сколько часов они сложились и
        // сколько стоил час. Итог за три года не проверить, а строку за
        // март — можно.
        var byMonth = placed
            .GroupBy(pair => pair.Date.ToString("yyyy-MM"))
            .Select(group =>
            {
                double hours = group.Sum(pair => pair.Entry.PaidDuration.TotalHours);
                decimal earned = group.Sum(pair => pair.Entry.Pay);

                return new WorkHistoryMonthDto(
                    group.Key,
                    // Дни, а не смены: двойная смена в один день — это один
                    // отработанный день, и путать их в табеле нельзя.
                    group.Select(pair => pair.Date).Distinct().Count(),
                    group.Count(),
                    Math.Round(hours, 1),
                    withMoney ? Math.Round(earned, 0) : null,
                    withMoney && hours > 0 ? Math.Round(earned / (decimal)hours, 0) : null);
            })
            .OrderByDescending(month => month.month, StringComparer.Ordinal)
            .ToArray();

        return new WorkHistoryDto(
            placed.Length,
            Math.Round(placed.Sum(pair => pair.Entry.PaidDuration.TotalHours), 0),
            Months(first, last),
            first.ToString("yyyy-MM"),
            last.ToString("yyyy-MM"),
            places,
            roles,
            byMonth);
    }

    /// <summary>How long somebody has been at it, in months, counting both ends.</summary>
    private static int Months(DateOnly first, DateOnly last)
        => ((last.Year - first.Year) * 12) + last.Month - first.Month + 1;
}
