using Shifter.Application.Common.Exceptions;
using Shifter.Application.Features.business.DTOs;
using Shifter.Application.Features.business.Services.Interfaces;
using Shifter.Domain.Entities;
using Shifter.Infrastructure.Repositories.Interfaces;

namespace Shifter.Application.Features.business.Services;

/// <summary>
/// Answers two questions the totals cannot: when is money due and from whom,
/// and has anywhere been paying short.
///
/// Both fall out of data the app already keeps — each place has its own pay
/// period, and payouts record what actually arrived — but nobody can hold a
/// dozen overlapping cycles in their head, which is exactly why underpayment
/// goes unnoticed.
/// </summary>
public class ReconciliationHandler : IReconciliationHandler
{
    /// <summary>
    /// Below this, a difference is a rounding artefact of hours and rates
    /// rather than a shortfall worth raising with anyone.
    /// </summary>
    private const decimal Tolerance = 1m;

    /// <summary>A period is only chased once its work is actually finished.</summary>
    private const int GraceDays = 0;

    private readonly IShifterQuery _shifterQuery;

    public ReconciliationHandler(IShifterQuery shifterQuery)
        => _shifterQuery = shifterQuery;

    public async Task<ReconciliationDto> BuildAsync(
        int userId,
        DateOnly from,
        DateOnly to,
        CancellationToken ct)
    {
        if (from > to)
            throw new ValidationException("Range start must not be after its end.");

        Location[] places = await _shifterQuery.GetLocationsAsync(userId, true, ct);
        Dictionary<int, Location> byId = places.ToDictionary(place => place.Id);

        // Periods overhang the range at both ends, so the days are fetched
        // wider: a March period that starts on the 25th of February still owes
        // money for February days.
        Day[] days = await _shifterQuery.GetDaysInRangeAsync(
            userId, from.AddDays(-45), to.AddDays(45), ct);

        Payout[] payouts = await _shifterQuery.GetPayoutsAsync(
            userId, from.AddDays(-45), to.AddDays(45), ct);

        DateOnly today = DateOnly.FromDateTime(DateTime.UtcNow);
        List<PayPeriodDto> rows = [];

        foreach (Location place in places)
        {
            foreach (var (periodFrom, periodTo) in PeriodsIn(place, from, to))
            {
                Day[] inPeriod = days
                    .Where(day => day.Date >= periodFrom && day.Date <= periodTo)
                    .ToArray();

                LocationTotalDto? total = DayHandler
                    .ByLocation(inPeriod, byId)
                    .FirstOrDefault(entry => entry.location_id == place.Id);

                // Nothing worked there in that period is not an unpaid period.
                if (total is null || total.hours == 0) continue;

                decimal paid = payouts
                    .Where(payout => payout.LocationId == place.Id
                        && Overlaps(payout, periodFrom, periodTo))
                    .Sum(payout => payout.Amount);

                // Take-home rather than gross: what should land in a pocket is
                // what a payment can sensibly be compared against.
                decimal expected = total.net;
                decimal difference = paid - expected;

                DateOnly due = DueDate(place, periodTo);
                int late = paid == 0m && today > due ? today.DayNumber - due.DayNumber : 0;

                rows.Add(new PayPeriodDto(
                    place.Id,
                    place.Name,
                    place.Colour,
                    periodFrom,
                    periodTo,
                    due,
                    expected,
                    paid,
                    difference,
                    total.hours,
                    Status(periodTo, due, today, paid, difference),
                    late));
            }
        }

        PayPeriodDto[] periods = rows
            .OrderByDescending(row => row.period_from)
            .ThenBy(row => row.location_name)
            .ToArray();

        return new ReconciliationDto(
            periods,
            Shortfalls(periods),
            // Only settled work counts as awaited; a period still being worked
            // has not been earned in full yet.
            periods.Where(row => row.status is "due" or "overdue")
                .Sum(row => row.expected - row.paid),
            periods.Where(row => row.status == "overdue")
                .Sum(row => row.expected - row.paid));
    }

    /// <summary>Every pay period of this place that touches the range.</summary>
    private static IEnumerable<(DateOnly From, DateOnly To)> PeriodsIn(
        Location place,
        DateOnly from,
        DateOnly to)
    {
        var (periodFrom, periodTo) = PayPeriodCalculator.PeriodFor(place, from);

        // Walking period by period rather than day by day: the calculator is
        // the single source of truth for where the boundaries fall, and a
        // weekly cycle over a year is 52 steps instead of 365.
        while (periodFrom <= to)
        {
            yield return (periodFrom, periodTo);

            (periodFrom, periodTo) = PayPeriodCalculator.PeriodFor(place, periodTo.AddDays(1));
        }
    }

    /// <summary>
    /// When the money for a finished period is expected. Monthly places pay on
    /// their pay day in the month after the period closes; the rolling cycles
    /// pay shortly after the period ends.
    /// </summary>
    private static DateOnly DueDate(Location place, DateOnly periodTo) => place.PayPeriod switch
    {
        PayPeriod.Monthly => periodTo.AddDays(1),
        PayPeriod.SemiMonthly => periodTo.AddDays(5),
        PayPeriod.BiWeekly => periodTo.AddDays(3),
        PayPeriod.Weekly => periodTo.AddDays(3),
        _ => periodTo.AddDays(1),
    };

    private static bool Overlaps(Payout payout, DateOnly from, DateOnly to)
        => payout.PeriodFrom <= to && payout.PeriodTo >= from;

    private static string Status(
        DateOnly periodTo,
        DateOnly due,
        DateOnly today,
        decimal paid,
        decimal difference)
    {
        // Still being worked: there is nothing to chase yet.
        if (periodTo >= today) return "open";

        if (paid == 0m) return today > due.AddDays(GraceDays) ? "overdue" : "due";

        if (difference < -Tolerance) return "short";
        if (difference > Tolerance) return "over";

        return "paid";
    }

    /// <summary>
    /// A run of short periods at one place, newest first. Stops at the first
    /// period that was settled: the claim being made is "this keeps
    /// happening", and an interruption breaks it.
    /// </summary>
    private static ShortfallDto[] Shortfalls(PayPeriodDto[] periods)
    {
        List<ShortfallDto> found = [];

        foreach (var group in periods.GroupBy(row => row.location_id))
        {
            PayPeriodDto[] settled = group
                .Where(row => row.status is not "open")
                .OrderByDescending(row => row.period_from)
                .ToArray();

            List<PayPeriodDto> run = [];

            foreach (PayPeriodDto row in settled)
            {
                if (row.status is "short" or "overdue") run.Add(row);
                else break;
            }

            // One short period is an argument about rounding; two is a habit.
            if (run.Count < 2) continue;

            found.Add(new ShortfallDto(
                group.Key,
                group.First().location_name,
                run.Count,
                run.Sum(row => row.expected - row.paid),
                run.Min(row => row.period_from)));
        }

        return found.OrderByDescending(entry => entry.total_short).ToArray();
    }
}
