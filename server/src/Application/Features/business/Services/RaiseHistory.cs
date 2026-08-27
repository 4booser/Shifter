using Shifter.Application.Features.business.DTOs;
using Shifter.Domain.Entities;

namespace Shifter.Application.Features.business.Services;

/// <summary>
/// When the rate moved, and what it has been worth since.
///
/// Derived from the shifts themselves rather than kept in a log: every
/// placement already carries a snapshot of what it paid, so the history is a
/// record of money that actually changed hands, not of what a template said at
/// some point. A log could drift from the days; this cannot.
///
/// What it buys is not really the list. It is the last line of it — the date
/// somebody last got a raise, which almost nobody can name off the top of their
/// head and everybody feels.
/// </summary>
public static class RaiseHistory
{
    /// <summary>
    /// Every change of rate on every shift worked in the range, newest first.
    /// </summary>
    public static RaiseDto[] Of(IEnumerable<Day> days, DateOnly today)
    {
        List<RaiseDto> found = [];

        var placements = days
            .SelectMany(day => (day.Shifts ?? []).Select(entry => (day.Date, Entry: entry)))
            .Where(placed => placed.Entry.Worked && placed.Entry.SalaryAmount is not null)
            .OrderBy(placed => placed.Date);

        foreach (var group in placements.GroupBy(placed => placed.Entry.ShiftId))
        {
            var run = group.ToArray();

            for (int i = 1; i < run.Length; i++)
            {
                DayShift before = run[i - 1].Entry;
                DayShift after = run[i].Entry;

                // A rate in one period is not comparable to a rate in another:
                // 200 an hour and 200 a day are not a cut of nothing, they are
                // two different deals, and calling that a pay change would be
                // a lie told with real numbers.
                if (before.SalaryPeriod != after.SalaryPeriod) continue;
                if (before.SalaryAmount == after.SalaryAmount) continue;

                // Hours worked at the new rate, from the day it changed. What a
                // raise has been worth is the only part of this that is not
                // obvious from the two numbers themselves.
                double hoursSince = run
                    .Skip(i)
                    .Sum(placed => placed.Entry.PaidDuration.TotalHours);

                int shiftsSince = run.Length - i;

                found.Add(new RaiseDto(
                    after.ShiftId,
                    after.Shift?.Name ?? string.Empty,
                    after.Shift?.Location?.Name,
                    run[i].Date,
                    before.SalaryAmount ?? 0m,
                    after.SalaryAmount ?? 0m,
                    after.SalaryPeriod.ToString().ToLowerInvariant(),
                    Worth(before, after, hoursSince, shiftsSince),
                    today.DayNumber - run[i].Date.DayNumber));
            }
        }

        return found
            .OrderByDescending(entry => entry.on)
            .ThenBy(entry => entry.shift_name)
            .ToArray();
    }

    /// <summary>
    /// What the change has come to since it happened: the difference in rate
    /// against the work actually done at the new one. Negative where the rate
    /// went down, which is the case worth naming out loud.
    /// </summary>
    private static decimal Worth(
        DayShift before,
        DayShift after,
        double hoursSince,
        int shiftsSince)
    {
        decimal step = (after.SalaryAmount ?? 0m) - (before.SalaryAmount ?? 0m);

        return after.SalaryPeriod switch
        {
            SalaryPeriod.Hour => step * (decimal)hoursSince,
            SalaryPeriod.Day => step * shiftsSince,
            // Weekly and monthly wages are counted once per period they cover,
            // and this class does not know where those periods fall. Reporting
            // the step alone is honest; multiplying it by shifts would not be.
            _ => step,
        };
    }
}
