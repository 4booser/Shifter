using Shifter.Application.Common.Exceptions;
using Shifter.Application.Common.Time;
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

    /// <summary>
    /// How much of the past one request may ask for. The walk is per pay
    /// period per place, so this is a cost limit rather than a product one.
    /// </summary>
    private const int MaxDays = 366 * 2;

    private readonly IShifterQuery _shifterQuery;
    private readonly AppClock _clock;

    public ReconciliationHandler(IShifterQuery shifterQuery, AppClock? clock = null)
    {
        _shifterQuery = shifterQuery;
        _clock = clock ?? new AppClock();
    }

    public async Task<ReconciliationDto> BuildAsync(
        int userId,
        DateOnly from,
        DateOnly to,
        CancellationToken ct)
    {
        if (from > to)
            throw new ValidationException("Range start must not be after its end.");

        // Every pay period in the range is walked one at a time, and each step
        // re-aggregates the whole day history — so an open-ended range was
        // minutes of processor time on a single GET, chosen entirely by the
        // caller. Two years is longer than anybody reads at once, and every
        // other range in the app is already bounded.
        if (to.DayNumber - from.DayNumber > MaxDays)
            throw new ValidationException($"A range must be at most {MaxDays} days.");

        Location[] places = await _shifterQuery.GetLocationsAsync(userId, true, ct);
        Dictionary<int, Location> byId = places.ToDictionary(place => place.Id);

        // Periods overhang the range at both ends, so the days are fetched
        // wider: a March period that starts on the 25th of February still owes
        // money for February days.
        Day[] days = await _shifterQuery.GetDaysInRangeAsync(
            userId, from.AddDays(-45), to.AddDays(45), ct);

        Payout[] payouts = await _shifterQuery.GetPayoutsAsync(
            userId, from.AddDays(-45), to.AddDays(45), ct);

        PeriodSettlement[] closed = await _shifterQuery.GetSettlementsAsync(userId, ct);
        Dictionary<(int, DateOnly, string), PeriodSettlement> lines = closed.ToDictionary(
            entry => (entry.LocationId, entry.PeriodFrom, entry.Stream));

        DateOnly today = _clock.Today;
        List<PayPeriodDto> rows = [];

        foreach (Location place in places)
        {
            // A place that settles the commission on its own cycle owes two
            // payments covering different spans of the same work, so each
            // schedule is walked separately and the money is split between
            // them. Where there is only one schedule this runs once and the
            // whole take-home stays on a single row, as it always did.
            bool split = PayPeriodCalculator.SplitsSales(place);

            foreach (var (periodFrom, periodTo) in PeriodsIn(place, from, to))
            {
                LocationTotalDto? total = TotalFor(place, days, byId, periodFrom, periodTo);

                if (total is null) continue;

                // Commission is taxed at the same rate as the rest, so taking
                // its share out is exact rather than apportioned: the two
                // halves still add up to the take-home for the period.
                decimal commissionNet = split ? NetCommission(place, total) : 0m;

                rows.Add(Row(
                    place, total, payouts, today, periodFrom, periodTo,
                    total.net - commissionNet,
                    split ? "wage" : "all"));
            }

            if (!split) continue;

            foreach (var (periodFrom, periodTo) in SalesPeriodsIn(place, from, to))
            {
                LocationTotalDto? total = TotalFor(place, days, byId, periodFrom, periodTo);

                if (total is null) continue;

                decimal commissionNet = NetCommission(place, total);

                // No sales in the period is not an unpaid commission.
                if (commissionNet == 0m) continue;

                rows.Add(Row(
                    place, total, payouts, today, periodFrom, periodTo,
                    commissionNet,
                    "commission"));
            }
        }

        PayPeriodDto[] periods = rows
            .OrderByDescending(row => row.period_from)
            .ThenBy(row => row.location_name)
            // A shortfall somebody has drawn a line under is still a short
            // period — the arithmetic did not change — but it stops being
            // owed, so it carries the line rather than being hidden.
            .Select(row => lines.TryGetValue((row.location_id, row.period_from, row.stream), out var line)
                ? row with { settled = line.Kind, settled_note = line.Note }
                : row)
            .ToArray();

        return new ReconciliationDto(
            periods,
            Shortfalls(periods),
            // Only settled work counts as awaited; a period still being worked
            // has not been earned in full yet.
            periods.Where(row => row.settled is null && row.status is "due" or "overdue" or "partial")
                .Sum(row => row.expected - row.paid),
            periods.Where(row => row.settled is null
                    && (row.status == "overdue"
                        // A half-paid period whose settlement date has passed is
                        // late for the rest of it, not merely unfinished.
                        || (row.status == "partial" && today > row.due_on)))
                .Sum(row => row.expected - row.paid));
    }

    /// <summary>
    /// What this place earned between two dates, or null when nothing was
    /// worked there — an empty period is not an unpaid one.
    /// </summary>
    private static LocationTotalDto? TotalFor(
        Location place,
        Day[] days,
        Dictionary<int, Location> byId,
        DateOnly from,
        DateOnly to)
    {
        Day[] inPeriod = days
            .Where(day => day.Date >= from && day.Date <= to)
            .ToArray();

        LocationTotalDto? total = DayHandler
            .ByLocation(inPeriod, byId)
            .FirstOrDefault(entry => entry.location_id == place.Id);

        return total is null || total.hours == 0 ? null : total;
    }

    /// <summary>
    /// The commission after this place's own withholding. Every component is
    /// taxed at one rate, so the commission's share of the tax is simply the
    /// rate applied to the commission.
    /// </summary>
    private static decimal NetCommission(Location place, LocationTotalDto total)
        => total.sales - (total.sales * place.TaxPercent / 100m);

    private static PayPeriodDto Row(
        Location place,
        LocationTotalDto total,
        Payout[] payouts,
        DateOnly today,
        DateOnly periodFrom,
        DateOnly periodTo,
        decimal expected,
        string stream)
    {
        Payout[] against = payouts
            .Where(payout => payout.LocationId == place.Id
                && Settles(payout, stream)
                && Overlaps(payout, periodFrom, periodTo))
            .ToArray();

        decimal paid = against.Sum(payout => payout.Amount);

        // An advance is money in hand, so it counts towards what arrived — but
        // it is also a promise that more is coming, which is the difference
        // between "they paid short" and "they have not finished paying".
        decimal advance = against
            .Where(payout => payout.Kind == "advance")
            .Sum(payout => payout.Amount);

        bool closed = against.Any(payout => payout.Kind != "advance");

        decimal difference = paid - expected;

        // The commission is chased on its own cycle, not the wage's.
        PayPeriod cycle = stream == "commission" && place.SalesPayPeriod is PayPeriod sales
            ? sales
            : place.PayPeriod;

        DateOnly due = DueDate(cycle, periodTo);
        int late = paid == 0m && today > due ? today.DayNumber - due.DayNumber : 0;

        return new PayPeriodDto(
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
            Status(periodTo, due, today, paid, difference, advance, closed),
            late,
            stream,
            paid_advance: advance);
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

    /// <summary>The same walk, over the commission's own cycle.</summary>
    private static IEnumerable<(DateOnly From, DateOnly To)> SalesPeriodsIn(
        Location place,
        DateOnly from,
        DateOnly to)
    {
        var (periodFrom, periodTo) = PayPeriodCalculator.SalesPeriodFor(place, from);

        while (periodFrom <= to)
        {
            yield return (periodFrom, periodTo);

            (periodFrom, periodTo) = PayPeriodCalculator.SalesPeriodFor(place, periodTo.AddDays(1));
        }
    }

    /// <summary>
    /// When the money for a finished period is expected. Monthly places pay on
    /// their pay day in the month after the period closes; the rolling cycles
    /// pay shortly after the period ends.
    /// </summary>
    private static DateOnly DueDate(PayPeriod cycle, DateOnly periodTo) => cycle switch
    {
        PayPeriod.Monthly => periodTo.AddDays(1),
        PayPeriod.SemiMonthly => periodTo.AddDays(5),
        PayPeriod.BiWeekly => periodTo.AddDays(3),
        PayPeriod.Weekly => periodTo.AddDays(3),
        _ => periodTo.AddDays(1),
    };

    private static bool Overlaps(Payout payout, DateOnly from, DateOnly to)
        => payout.PeriodFrom <= to && payout.PeriodTo >= from;

    /// <summary>
    /// Whether a recorded payment answers this row. Payments made before the
    /// place split its commission out carry "all", and are read as settling the
    /// wage: that is what they were at the time, and counting them against both
    /// rows would show a single transfer as having paid twice.
    /// </summary>
    private static bool Settles(Payout payout, string stream)
        => payout.Stream == stream || (stream == "wage" && payout.Stream == "all");

    private static string Status(
        DateOnly periodTo,
        DateOnly due,
        DateOnly today,
        decimal paid,
        decimal difference,
        decimal advance,
        bool closed)
    {
        // Still being worked: there is nothing to chase yet.
        if (periodTo >= today) return "open";

        if (paid == 0m) return today > due.AddDays(GraceDays) ? "overdue" : "due";

        // The advance arrived and the settlement has not. That is the normal
        // shape of a month at half the places in this trade, and calling it a
        // shortfall would train people to ignore the word.
        if (difference < -Tolerance && advance > 0m && !closed) return "partial";

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

        // By payment, not just by place: where a place settles the wage and the
        // commission separately they are two different things going wrong, and
        // a run that alternated between them would not be the pattern the
        // claim is making.
        foreach (var group in periods.GroupBy(row => (row.location_id, row.stream)))
        {
            PayPeriodDto[] settled = group
                // A period still being worked, or still half-paid, is not
                // evidence either way — it is skipped rather than allowed to
                // break a run, or the current month would hide the pattern
                // behind it every time.
                .Where(row => row.status is not ("open" or "partial"))
                .OrderByDescending(row => row.period_from)
                .ToArray();

            List<PayPeriodDto> run = [];

            foreach (PayPeriodDto row in settled)
            {
                // A closed period breaks the run like a settled one: the
                // claim being made is "this keeps happening to me", and a
                // month somebody has finished arguing about does not.
                if (row.settled is null && row.status is "short" or "overdue") run.Add(row);
                else break;
            }

            // One short period is an argument about rounding; two is a habit.
            if (run.Count < 2) continue;

            found.Add(new ShortfallDto(
                group.Key.location_id,
                group.First().location_name,
                run.Count,
                run.Sum(row => row.expected - row.paid),
                run.Min(row => row.period_from),
                group.Key.stream));
        }

        return found.OrderByDescending(entry => entry.total_short).ToArray();
    }

    /// <summary>
    /// One pay period at one place, taken apart into the lines a payslip has.
    ///
    /// The rest of this class answers "did the money arrive". This answers
    /// "which part of it did not", which is the question somebody actually
    /// takes to a manager — a total that disagrees by ₴1 440 is an argument,
    /// and "the night hours were not paid" is a question with an answer.
    /// </summary>
    public async Task<PayslipCheckDto> CheckAsync(
        int userId,
        int locationId,
        DateOnly on,
        CancellationToken ct)
    {
        Location[] places = await _shifterQuery.GetLocationsAsync(userId, true, ct);
        Dictionary<int, Location> byId = places.ToDictionary(place => place.Id);

        Location place = byId.GetValueOrDefault(locationId)
            ?? throw new NotFoundException("Place of work does not exist.");

        var (from, to) = PayPeriodCalculator.PeriodFor(place, on);

        Day[] days = await _shifterQuery.GetDaysInRangeAsync(userId, from, to, ct);

        LocationTotalDto total = DayHandler
            .ByLocation(days, byId)
            .FirstOrDefault(entry => entry.location_id == place.Id)
            ?? new LocationTotalDto(
                place.Id, place.Name, place.Colour, 0, 0m, 0,
                0m, 0m, 0m, 0m, 0m, 0m, 0m, 0m, place.Currency);

        return PayslipCheck.For(place, days, from, to, total, byId);
    }
}
