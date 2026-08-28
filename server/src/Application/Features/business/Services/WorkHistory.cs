using Shifter.Application.Features.business.DTOs;
using Shifter.Domain.Entities;

namespace Shifter.Application.Features.business.Services;

/// <summary>
/// A biography made of shifts.
///
/// Somebody who has used this app for two years is carrying a proven work
/// history — how long, where, how many shifts, what an hour was worth — and at
/// an interview they recite it from memory and round it wrong in both
/// directions. Nothing here is invented: every figure comes from days that were
/// actually recorded, which is exactly what makes it worth showing to somebody
/// who has no reason to believe you.
///
/// What it deliberately leaves out is money, unless asked. A CV that opens with
/// what you were paid is a CV that argues about the wrong thing first.
/// </summary>
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
            return new WorkHistoryDto(0, 0, 0, null, null, [], []);
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
                    // history is about the person, not about the record.
                    place?.Name ?? "—",
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

        return new WorkHistoryDto(
            placed.Length,
            Math.Round(placed.Sum(pair => pair.Entry.PaidDuration.TotalHours), 0),
            Months(first, last),
            first.ToString("yyyy-MM"),
            last.ToString("yyyy-MM"),
            places,
            roles);
    }

    /// <summary>
    /// How long somebody has been at it, in months, counting both ends. A
    /// career of one shift is one month rather than none — the alternative
    /// reads as an error.
    /// </summary>
    private static int Months(DateOnly first, DateOnly last)
        => ((last.Year - first.Year) * 12) + last.Month - first.Month + 1;
}
