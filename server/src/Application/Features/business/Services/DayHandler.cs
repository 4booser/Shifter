using System.Globalization;
using Shifter.Application.Common.Time;
using System.Text.RegularExpressions;
using Shifter.Application.Common.Exceptions;
using Shifter.Application.Features.business.DTOs;
using Shifter.Application.Features.business.Services.Interfaces;
using Shifter.Domain.Entities;
using Shifter.Infrastructure.Repositories.Interfaces;

namespace Shifter.Application.Features.business.Services;

public partial class DayHandler : IDayHandler
{
    private const int NoteMaxLength = 500;
    private const int MaxBulkDates = 400;

    // Used for shifts with no place of work attached.
    private const double DefaultOvertimeHours = 40;
    private const decimal DefaultOvertimeMultiplier = 1.5m;

    private readonly IShifterCommand _shifterCommand;
    private readonly IShifterQuery _shifterQuery;
    private readonly DayAuditWriter? _audit;
    private readonly GoalCelebrator? _goals;
    private readonly Money.RateService? _rates;
    private readonly Money.MonoRateClient? _market;
    private readonly AppClock _clock;

    // The audit hand is optional so the unit tests, which build this by
    // hand around fakes, stay ignorant of it.
    public DayHandler(
        IShifterCommand shifterCommand,
        IShifterQuery shifterQuery,
        DayAuditWriter? audit = null,
        GoalCelebrator? goals = null,
        Money.RateService? rates = null,
        AppClock? clock = null,
        // Optional like the rest: the tests that hand around fakes have no
        // business reaching a bank over the internet, and a second opinion
        // that is absent simply is not shown.
        Money.MonoRateClient? market = null)
    {
        _shifterCommand = shifterCommand;
        _shifterQuery = shifterQuery;
        _audit = audit;
        _goals = goals;
        _rates = rates;
        _market = market;
        _clock = clock ?? new AppClock();
    }

    public async Task<DaysDto> ListAsync(
        int userId,
        DateOnly from,
        DateOnly to,
        CancellationToken ct,
        string? baseCurrency = null)
    {
        if (from > to)
            throw new ValidationException("Range start must not be after its end.");

        Day[] days = await _shifterQuery.GetDaysInRangeAsync(userId, from, to, ct);

        // Two reckonings need to see outside the range they report on.
        //
        // Overtime is a weekly threshold and the calendar is read a month at a
        // time, so a week straddling the first of the month reached it in
        // neither month and the money disappeared. A salary is earned over a
        // whole month, so a ten-day range has to know how much of that month
        // was worked before it can say what those ten days were worth.
        //
        // Nothing is counted from these days directly; they are context.
        Day[] around = await _shifterQuery.GetDaysInRangeAsync(
            userId, from.AddDays(-35), to.AddDays(35), ct);

        Payout[] payouts = await _shifterQuery.GetPayoutsAsync(userId, from, to, ct);
        Event[] events = await _shifterQuery.GetEventsInRangeAsync(userId, from, to, ct);

        // Locations first: the day view needs them for tip-out and meals, and
        // every total below is derived from the days once they are built.
        Location[] places = await _shifterQuery.GetLocationsAsync(userId, true, ct);
        Dictionary<int, Location> byId = places.ToDictionary(place => place.Id);

        DayDto[] dtos = days.Select(day => ToDto(day, byId)).ToArray();

        DayShift[] entries = days.SelectMany(day => day.Shifts ?? []).ToArray();
        DayShift[] worked = entries.Where(entry => entry.Worked).ToArray();
        DayShift[] planned = entries.Where(entry => !entry.Worked).ToArray();

        decimal salesEarned = dtos.SelectMany(day => day.sales).Sum(entry => entry.earned);
        decimal tipsEarned = days.Sum(day => day.Tips ?? 0m);
        decimal periodEarned = PeriodSalary(days, workedOnly: true, around);
        decimal shiftsEarned = worked.Sum(entry => entry.Pay);
        decimal revenueEarned = worked.Sum(entry => entry.RevenuePay);
        decimal revenueCounted = worked.Sum(entry => entry.Revenue ?? 0m);

        // Only the shifts that recorded both. An average cheque computed from
        // the takings of one evening and the covers of another describes
        // neither, and it is the kind of figure a manager quotes back.
        var counted = worked.Where(entry => entry.Guests is > 0 && entry.Revenue is not null).ToArray();
        int guestsCounted = counted.Sum(entry => entry.Guests!.Value);
        decimal? averageCheque = guestsCounted <= 0
            ? null
            : Math.Round(counted.Sum(entry => entry.Revenue!.Value) / guestsCounted, 2);

        // Tips follow the hours inside a day: a night split between the bar
        // and the terrace splits its tips the same way, because that is the
        // only division the data supports and inventing another would be
        // deciding on somebody's behalf which half of the evening earned it.
        //
        // Walked from the days rather than from the flattened placements: a
        // placement does not reliably carry a way back to its day, and a
        // silent zero here would read as "the terrace tips nothing".
        Dictionary<ShiftZone, (double Hours, decimal Tips, int Shifts)> zones = [];

        foreach (Day day in days)
        {
            DayShift[] on = (day.Shifts ?? []).Where(entry => entry.Worked).ToArray();
            double dayHours = on.Sum(entry => entry.PaidDuration.TotalHours);

            foreach (DayShift entry in on)
            {
                double hours = entry.PaidDuration.TotalHours;
                decimal share = dayHours <= 0
                    ? 0m
                    : (day.Tips ?? 0m) * (decimal)(hours / dayHours);

                var (had, tips, count) = zones.GetValueOrDefault(entry.Zone);

                zones[entry.Zone] = (had + hours, tips + share, count + 1);
            }
        }

        ZoneTotalDto[] byZone = zones
            .Select(pair => new ZoneTotalDto(
                ZoneName(pair.Key),
                Math.Round(pair.Value.Hours, 2),
                Math.Round(pair.Value.Tips, 2),
                pair.Value.Hours <= 0
                    ? 0m
                    : Math.Round(pair.Value.Tips / (decimal)pair.Value.Hours, 2),
                pair.Value.Shifts))
            .OrderByDescending(row => row.tips_per_hour)
            .ToArray();

        // Both are kept per place and summed here for the headline, so the
        // figure on the dashboard and the figure inside each place's tax are
        // the same arithmetic rather than two that happen to agree.
        var overtime = OvertimeByPlace(around, byId, from, to);
        var premiums = PremiumsByPlace(days, byId);

        double overtimeHours = Math.Round(overtime.Values.Sum(pair => pair.Hours), 2);
        decimal overtimeExtra = overtime.Values.Sum(pair => pair.Extra);
        double nightHours = Math.Round(premiums.Values.Sum(pair => pair.Night), 2);
        decimal premiumExtra = premiums.Values.Sum(pair => pair.Extra);

        decimal tipOut = days.Sum(day => TipOutFor(day, byId));
        decimal deductions = days.Sum(day => DeductionsFor(day, byId));

        // What the work cost. Read here rather than folded into any total: a
        // taxi home is money that left after the wage arrived, and subtracting
        // it would stop the app agreeing with anybody's payslip.
        WorkExpense[] expenses = await _shifterQuery.GetExpensesAsync(userId, from, to, ct);

        decimal totalEarned =
            shiftsEarned + salesEarned + tipsEarned + periodEarned + overtimeExtra + premiumExtra
            - tipOut - deductions;
        decimal plannedEarned =
            planned.Sum(entry => entry.Pay) + PeriodSalary(days, workedOnly: false, around)
            - periodEarned;

        decimal paid = payouts.Sum(payout => payout.Amount);

        LocationTotalDto[] byLocation = ByLocation(days, byId, around);

        // Summed from the per-place figures rather than recomputed: each place
        // taxes differently, and one blended rate would be a fiction.
        decimal tax = byLocation.Sum(total => total.tax);
        decimal holiday = byLocation.Sum(total => total.holiday);

        // The period wage is not attached to any one place, so it is taxed at
        // the rate of the place its shifts belong to; where that is unknown it
        // stays untaxed rather than guessed at.
        string[] currencies = byLocation
            .Select(total => total.currency)
            .Where(code => code.Length > 0)
            .Distinct()
            .Order()
            .ToArray();

        return new DaysDto(
            dtos,
            Math.Round(worked.Sum(entry => entry.PaidDuration.TotalHours), 2),
            Math.Round(planned.Sum(entry => entry.PaidDuration.TotalHours), 2),
            shiftsEarned,
            salesEarned,
            tipsEarned,
            periodEarned,
            totalEarned,
            plannedEarned,
            days.Count(day => (day.Shifts ?? []).Any(entry => entry.Worked)),
            days.Count(day => (day.Shifts ?? []).Any(entry => !entry.Worked)),
            paid,
            // Negative means the payment fell short of what was calculated.
            paid == 0m ? 0m : paid - totalEarned,
            tipOut,
            deductions,
            ByReason(days),
            RaiseHistory.Of(days, _clock.Today),
            ExpenseRules.ByKind(expenses),
            expenses.Sum(expense => expense.Amount),
            ExpenseRules.TravelShareOfTips(expenses, tipsEarned),
            tax,
            totalEarned - tax,
            holiday,
            currencies,
            byLocation,
            overtimeHours,
            overtimeExtra,
            nightHours,
            premiumExtra,
            revenueEarned,
            revenueCounted,
            guestsCounted,
            averageCheque,
            byZone,
            events.Select(EventHandler.ToDto).ToArray(),
            await ConvertAsync(byLocation, currencies, baseCurrency, to, payouts, ct)
        );
    }

    public async Task<DayDto> SaveAsync(
        DaySaveDto request,
        int userId,
        DateOnly date,
        CancellationToken ct)
    {
        if (request.note?.Length > NoteMaxLength)
            throw new ValidationException($"Note must be at most {NoteMaxLength} characters.");

        if (request.tips < 0 || request.tips_cash < 0)
            throw new ValidationException("Tips cannot be negative.");

        if (request.tips_cash > (request.tips ?? 0m))
            throw new ValidationException("Cash tips cannot exceed the total.");

        if (request.deductions < 0)
            throw new ValidationException("Deductions cannot be negative.");

        // Two devices, one day: whoever saves over a version they never saw
        // gets stopped, not merged. The day is always sent whole, so a stale
        // echo means the whole other edit would be buried. Old clients send
        // no version and keep last-write-wins — they cannot be asked.
        if (request.version is int seen)
        {
            // No row yet reads as version zero — the same zero a client sees
            // on an empty day — so creating a day both devices thought empty
            // conflicts only for the second one, which is the truth.
            var current = await _shifterQuery.GetDayVersionAsync(userId, date, ct) ?? 0;

            if (current != seen)
                throw new ConflictException(
                    "The day was changed on another device. Reload it, look at both versions, and decide.");
        }

        List<DayShift> shifts = await ResolveShiftsAsync(request.shifts, userId, date, ct);
        List<DaySale> sales = await ResolveSalesAsync(request.sales, userId, ct);

        // Where a shift on the day takes its tips from the pool, the person's
        // own share is derived rather than typed: the pool is the fact they
        // can see, their slice of it is arithmetic, and letting both be
        // entered by hand is how the two stop agreeing.
        decimal? tips = PooledTips(shifts, request.tip_pool) ?? request.tips;
        decimal? tipsCash = tips is null ? null : Math.Min(request.tips_cash ?? 0m, tips.Value);

        Day incoming = new Day()
        {
            UserId = userId,
            Date = date,
            Shifts = shifts,
            Sales = sales,
            Tips = tips,
            TipsCash = tipsCash,
            TipPool = request.tip_pool,
            Deductions = request.deductions,
            // A reason without a fine is noise, so it is dropped with the fine.
            DeductionReason = request.deductions > 0m
                ? ParseDeductionReason(request.deduction_reason)
                : null,
            Note = string.IsNullOrWhiteSpace(request.note) ? null : request.note.Trim(),
            Colour = NormaliseColour(request.colour)
        };

        Day saved = await _shifterCommand.UpsertDayAsync(incoming, ct);

        if (_audit is not null) await _audit.WriteAsync(userId, saved, "app", ct);

        // A save is the only moment earned money moves, so it is the only
        // moment a goal can be crossed.
        if (_goals is not null)
            await _goals.CheckAsync(
                userId, date,
                async (from, to) => (await ListAsync(userId, from, to, ct)).total_earned, ct);

        // Locations carry the tip-out rule, so without them the saved day would
        // come back with a different total than the calendar shows a moment
        // later when the range reloads.
        Location[] places = await _shifterQuery.GetLocationsAsync(userId, true, ct);

        return ToDto(saved, places.ToDictionary(place => place.Id));
    }

    public async Task<DayDto[]> BulkAsync(
        BulkShiftDto request,
        int userId,
        CancellationToken ct)
    {
        if (request.dates is null or [])
            throw new ValidationException("No dates given.");

        // A guard against a runaway range rather than a business rule: a rota
        // generator with a bad end date could otherwise ask for decades.
        if (request.dates.Length > MaxBulkDates)
            throw new ValidationException($"At most {MaxBulkDates} dates at a time.");

        bool add = request.mode?.ToLowerInvariant() switch
        {
            "add" => true,
            "remove" => false,
            _ => throw new ValidationException("mode must be add or remove.")
        };

        Shift[] shifts = await _shifterQuery.GetShiftsByIdsAsync(userId, [request.shift_id], ct);

        if (shifts.Length == 0)
            throw new NotFoundException("Shift does not exist.");

        Day[] touched = await _shifterCommand.ApplyShiftAsync(
            userId, request.dates, shifts[0], add, _clock.Today, ct);

        Location[] places = await _shifterQuery.GetLocationsAsync(userId, true, ct);
        Dictionary<int, Location> byId = places.ToDictionary(place => place.Id);

        return touched.Select(day => ToDto(day, byId)).ToArray();
    }

    /// <summary>
    /// The range in one currency, or null where there is nothing to convert.
    /// The rate of the last day of the range is used for the whole of it and
    /// said out loud: one stated rate is something a person can check against
    /// their own bank, and a per-day reconstruction is not.
    /// </summary>
    private async Task<ConversionDto?> ConvertAsync(
        LocationTotalDto[] byLocation,
        string[] currencies,
        string? baseCurrency,
        DateOnly on,
        /// <summary>
        /// What arrived, each carrying the rate of the day it arrived. Earnings
        /// are restated at one stated rate — a per-day reconstruction of a
        /// month's shifts is not something anybody can check — but a payment
        /// happened on a day, and that day's rate is written beside it.
        /// </summary>
        Payout[] payouts,
        CancellationToken ct)
    {
        if (_rates is null || baseCurrency is null) return null;

        var wanted = Money.NbuRateClient.Normalise(baseCurrency);

        // Places with no currency set earn in whatever the app is set to,
        // which is the base by definition.
        var codes = byLocation
            .Select(place => place.currency.Length == 3 ? place.currency.ToUpperInvariant() : wanted)
            .Distinct()
            .ToArray();

        // One currency and it is the base: there is nothing to say.
        if (codes.Length <= 1 && codes.All(code => code == wanted)) return null;

        var rates = await _rates.OnAsync([.. codes, wanted], on, ct);

        // The second opinion, asked for only where the base is hryvnia: a
        // Ukrainian bank's buy rate says nothing useful about converting
        // zlotys into euros, and printing it there would be a number beside
        // the wrong question.
        var market = wanted == "UAH" && _market is not null
            ? await _market.QuotesAsync(ct)
            : null;

        List<ConvertedPlaceDto> places = [];
        List<string> unconverted = [];
        decimal total = 0m;
        decimal net = 0m;

        foreach (var place in byLocation)
        {
            var code = place.currency.Length == 3 ? place.currency.ToUpperInvariant() : wanted;
            var converted = Money.RateService.Convert(place.earned, code, wanted, rates);

            places.Add(new ConvertedPlaceDto(
                place.location_id, place.name, code, place.earned, converted));

            if (converted is null)
            {
                if (!unconverted.Contains(code)) unconverted.Add(code);

                continue;
            }

            total += converted.Value;
            net += Money.RateService.Convert(place.net, code, wanted, rates) ?? 0m;
        }

        return new ConversionDto(
            wanted,
            Math.Round(total, 2),
            Math.Round(net, 2),
            [.. places],
            rates
                .Where(rate => codes.Contains(rate.Key))
                .OrderBy(rate => rate.Key)
                .Select(rate => new RateUsedDto(
                    rate.Key,
                    Money.NbuRateClient.Format(rate.Value.Rate),
                    rate.Value.On.ToString("yyyy-MM-dd"),
                    market is not null && market.TryGetValue(rate.Key, out var quote)
                        ? Money.NbuRateClient.Format(quote.Buy)
                        : null,
                    market is not null && market.TryGetValue(rate.Key, out var quoted)
                        ? quoted.On.ToString("yyyy-MM-dd")
                        : null))
                .ToArray(),
            [.. unconverted],
            PaidAt(payouts, wanted));
    }

    /// <summary>
    /// What arrived, at the rate of the day each payment landed.
    ///
    /// Null unless something in the range carries a stored rate: a payment
    /// recorded before rates began being kept has none, and converting it at
    /// today's would be the very thing this exists to stop.
    /// </summary>
    private static decimal? PaidAt(Payout[] payouts, string wanted)
    {
        var any = false;
        decimal total = 0m;

        foreach (var payout in payouts)
        {
            var code = payout.Currency.Length == 3
                ? Money.NbuRateClient.Normalise(payout.Currency)
                : wanted;

            if (code == wanted)
            {
                total += payout.Amount;
                continue;
            }

            // Only via the hryvnia, which is the only thing the stored rate
            // is against. Anything else would need a rate nobody wrote down.
            if (payout.RateToBase is not decimal rate || wanted != "UAH") return null;

            total += payout.Amount * rate;
            any = true;
        }

        return any ? Math.Round(total, 2) : null;
    }

    /// <summary>
    /// Empty and null both mean "no colour": the client clears the swatch by
    /// sending either, and neither should reach the database as a value.
    /// </summary>
    private static string? NormaliseColour(string? colour)
    {
        if (string.IsNullOrWhiteSpace(colour)) return null;

        string trimmed = colour.Trim();

        if (!HexColour().IsMatch(trimmed))
            throw new ValidationException("Colour must be a hex value like #1F3A5F.");

        return trimmed.ToUpperInvariant();
    }

    public async Task<DayDto[]> ColourAsync(
        BulkColourDto request,
        int userId,
        CancellationToken ct)
    {
        if (request.days is null or [])
            throw new ValidationException("No days given.");

        // Same guard as the bulk shift call: a runaway range would otherwise
        // paint decades, and nobody meant to.
        if (request.days.Length > MaxBulkDates)
            throw new ValidationException($"At most {MaxBulkDates} days at a time.");

        // Last value wins on a repeated date rather than the request being
        // rejected: a pattern laid over an overlapping selection is a normal
        // thing to send, and the caller's intent is plain.
        Dictionary<DateOnly, string?> colours = request.days
            .GroupBy(entry => entry.date)
            .ToDictionary(group => group.Key, group => NormaliseColour(group.Last().colour));

        Day[] touched = await _shifterCommand.ApplyColourAsync(userId, colours, ct);

        Location[] places = await _shifterQuery.GetLocationsAsync(userId, true, ct);
        Dictionary<int, Location> byId = places.ToDictionary(place => place.Id);

        return touched.Select(day => ToDto(day, byId)).ToArray();
    }

    /// <summary>
    /// The person's cut of the day's pool, or null when nothing on the day is
    /// pooled. Several pooled shifts on one day each take their own agreed
    /// share of the same pool, which is what a double is: two slices, one hat.
    /// </summary>
    private static decimal? PooledTips(List<DayShift> shifts, decimal? pool)
    {
        if (pool is not decimal amount || amount <= 0m) return null;

        decimal[] shares = shifts
            .Where(shift => shift.TipSource == TipSource.Pool && shift.TipPoolPercent > 0m)
            .Select(shift => shift.TipPoolPercent!.Value)
            .ToArray();

        if (shares.Length == 0) return null;

        return Math.Round(amount * shares.Sum() / 100m, 2);
    }

    private async Task<List<DayShift>> ResolveShiftsAsync(
        DayShiftSaveDto[]? requested,
        int userId,
        DateOnly date,
        CancellationToken ct)
    {
        if (requested is null or []) return [];

        // Deduplicate first: repeated ids would shorten the query result and
        // trip the count check below even when every id is valid.
        Dictionary<int, DayShiftSaveDto> byShift = requested
            .GroupBy(entry => entry.shift_id)
            .ToDictionary(group => group.Key, group => group.Last());

        Dictionary<int, bool> workedById = byShift
            .ToDictionary(pair => pair.Key, pair => pair.Value.worked);

        int[] wanted = workedById.Keys.ToArray();

        Shift[] shifts = await _shifterQuery.GetShiftsByIdsAsync(userId, wanted, ct);

        // A short result means an id either does not exist or belongs to
        // someone else. Both get the same answer.
        if (shifts.Length != wanted.Length)
            throw new NotFoundException("Some shifts do not exist.");

        return shifts
            .Select(shift =>
            {
                DayShiftSaveDto entry = byShift[shift.Id];
                DayShift placed = DayShift.From(shift, workedById[shift.Id]);

                // A shift already worked has nothing left to hand over.
                placed.NeedsCover = !placed.Worked && entry.needs_cover;

                // The recorded clock, kept only whole: a single honest edge
                // against a planned one would price an interval nobody worked.
                if (TimeOnly.TryParse(entry.actual_start, out TimeOnly actualStart)
                    && TimeOnly.TryParse(entry.actual_end, out TimeOnly actualEnd))
                {
                    placed.ActualStart = actualStart;
                    placed.ActualEnd = actualEnd;
                }

                if (entry.break_minutes is int breakMinutes && breakMinutes >= 0)
                    placed.BreakMinutes = breakMinutes;

                // The house rule applies itself. It is a floor, not an
                // override: a template that already books a longer break knows
                // something the rule does not.
                if (shift.Location is Location place
                    && place.AutoBreakAfterHours > 0m
                    && place.AutoBreakMinutes > placed.BreakMinutes
                    && (decimal)placed.Duration.TotalHours > place.AutoBreakAfterHours)
                {
                    placed.BreakMinutes = place.AutoBreakMinutes;
                }

                // Null stays null: "not counted yet" and "took nothing" are
                // different answers and only one of them is a zero.
                if (entry.revenue is decimal revenue && revenue >= 0m)
                    placed.Revenue = revenue;

                // Same rule for the covers: "nobody counted" and "nobody came"
                // are different evenings and only one of them is a zero.
                if (entry.guests is int guests && guests >= 0)
                    placed.Guests = guests;

                if (entry.zone is not null) placed.Zone = ParseZone(entry.zone);

                return placed;
            })
            .ToList();
    }

    private async Task<List<DaySale>> ResolveSalesAsync(
        DaySaleSaveDto[]? entries,
        int userId,
        CancellationToken ct)
    {
        if (entries is null or []) return [];

        // Zero means "nothing sold", which is the same as not listing it.
        DaySaleSaveDto[] wanted = entries.Where(entry => entry.quantity > 0).ToArray();

        if (wanted.Length == 0) return [];

        if (wanted.Select(entry => entry.sales_id).Distinct().Count() != wanted.Length)
            throw new ValidationException("A position is listed more than once.");

        int[] ids = wanted.Select(entry => entry.sales_id).ToArray();

        Sales[] positions = await _shifterQuery.GetSalesByIdsAsync(userId, ids, ct);

        if (positions.Length != ids.Length)
            throw new NotFoundException("Some sales positions do not exist.");

        Dictionary<int, Sales> byId = positions.ToDictionary(position => position.Id);

        // Price and percentage are copied, not referenced: repricing the
        // catalogue must not rewrite what was earned on days already worked.
        return wanted
            .Select(entry => new DaySale
            {
                SalesId = entry.sales_id,
                // Attaching the tracked position spares a re-read: without it
                // the saved day would come back with blank position names.
                Sales = byId[entry.sales_id],
                Quantity = entry.quantity,
                UnitPrice = byId[entry.sales_id].Price,
                Percentage = byId[entry.sales_id].Percentage ?? 0m
            })
            .ToList();
    }

    /// <summary>
    /// Extra owed for hours past the weekly threshold. Only hourly rates take
    /// part: a per-day or per-month wage has no hourly base to multiply, and
    /// inventing one would put money on the screen that nobody agreed to.
    ///
    /// Hours are taken in date order, so the overtime is whatever was worked
    /// after crossing the line — which is how it is actually paid.
    /// </summary>
    /// <summary>
    /// Overtime, kept per place. It used to be returned as one pair, which is
    /// why none of it ever reached the per-place figures — and therefore never
    /// reached tax, holiday accrual or the reconciliation's "expected".
    /// </summary>
    /// <summary>
    /// Public for the same reason PeriodSalary is: it is the only correct way
    /// to count the premium, and the draft pricer needs to run it over a week
    /// that is part real and part hypothetical.
    /// </summary>
    public static Dictionary<int, (double Hours, decimal Extra)> OvertimeByPlace(
        Day[] days,
        Dictionary<int, Location> locations,
        DateOnly? from = null,
        DateOnly? to = null)
    {
        var byWeek = days
            .SelectMany(day => (day.Shifts ?? []).Select(entry => (day.Date, entry)))
            .Where(pair => pair.entry.Worked)
            .GroupBy(pair => (
                Location: pair.entry.Shift?.LocationId ?? 0,
                Year: ISOWeek.GetYear(pair.Date.ToDateTime(TimeOnly.MinValue)),
                Week: ISOWeek.GetWeekOfYear(pair.Date.ToDateTime(TimeOnly.MinValue))));

        Dictionary<int, (double Hours, decimal Extra)> byPlace = [];

        foreach (var week in byWeek)
        {
            locations.TryGetValue(week.Key.Location, out Location? place);

            // The ?? only catches a place that is absent, not one holding a
            // zero — and places that predate the rule hold exactly that. A
            // threshold of zero makes the first hour of the week overtime and
            // every hour after it, which with the old zero multiplier
            // cancelled the month's pay outright.
            double threshold = place?.OvertimeWeeklyHours is double stated and > 0
                ? stated
                : DefaultOvertimeHours;
            decimal multiplier = place?.OvertimeMultiplier ?? DefaultOvertimeMultiplier;

            double running = 0;

            foreach (var (on, entry) in week.OrderBy(pair => pair.Date))
            {
                double hours = entry.PaidDuration.TotalHours;
                double before = running;

                running += hours;

                if (running <= threshold) continue;

                // Only the part of this shift that sits past the line.
                double over = running - Math.Max(before, threshold);

                // The whole week is walked so the threshold is reached where
                // it really is; only the days the caller asked about are
                // reported, or a month would count its neighbours' overtime.
                if (from is DateOnly start && on < start) continue;
                if (to is DateOnly end && on > end) continue;

                // Never below zero. A multiplier under 1 makes the factor
                // negative, and then an overtime hour subtracts an hour's pay
                // and the app reports the loss as what the overtime brought.
                // The form has always refused such a value; rows that predate
                // the rule held one anyway, so the arithmetic refuses it too.
                decimal premium = Math.Max(0m, multiplier - 1m);

                decimal paid = entry.SalaryPeriod == SalaryPeriod.Hour
                    ? (decimal)over * (entry.SalaryAmount ?? 0m) * premium
                    : 0m;

                var (hoursSoFar, extraSoFar) = byPlace.GetValueOrDefault(week.Key.Location);

                byPlace[week.Key.Location] = (hoursSoFar + over, extraSoFar + paid);
            }
        }

        return byPlace;
    }

    /// <summary>
    /// What the night and public-holiday rules add across a range. Both are
    /// off by default (multiplier 1.0), so a place that never agreed to them
    /// is priced exactly as before.
    /// </summary>
    /// <summary>
    /// Night and holiday premiums, kept per place for the same reason overtime
    /// is: a figure that only exists in the headline is a figure the tax, the
    /// holiday accrual and the reconciliation never see.
    /// </summary>
    private static Dictionary<int, (double Night, decimal Extra)> PremiumsByPlace(
        Day[] days,
        Dictionary<int, Location> locations)
    {
        Dictionary<int, (double Night, decimal Extra)> byPlace = [];

        foreach (Day day in days)
        {
            foreach (DayShift entry in (day.Shifts ?? []).Where(shift => shift.Worked))
            {
                locations.TryGetValue(entry.Shift?.LocationId ?? 0, out Location? place);

                if (place is null) continue;

                (TimeOnly from, TimeOnly to) =
                    entry.ActualStart is TimeOnly begin && entry.ActualEnd is TimeOnly finish
                        ? (begin, finish)
                        : (entry.StartTime, entry.EndTime);

                double night = PremiumCalculator.NightHours(from, to, place.NightFrom, place.NightTo);

                // The premium is paid on hours somebody is paid for. Counting
                // it on the raw clock paid the night rate through an unpaid
                // break — the two figures were measured from different bases.
                double clock = (entry.ActualStart is TimeOnly && entry.ActualEnd is TimeOnly
                    ? PremiumCalculator.Span(from, to)
                    : entry.Duration.TotalHours);

                double paidShare = clock <= 0 ? 0 : entry.PaidDuration.TotalHours / clock;

                night = Math.Min(night * paidShare, entry.PaidDuration.TotalHours);

                decimal earned = entry.SalaryPeriod == SalaryPeriod.Hour
                    ? PremiumCalculator.Extra(
                        night,
                        entry.PaidDuration.TotalHours,
                        entry.SalaryAmount ?? 0m,
                        place.NightMultiplier,
                        place.PublicHolidayMultiplier,
                        HolidayHours(entry, day.Date, place))
                    : 0m;

                int key = entry.Shift?.LocationId ?? 0;
                var (nightSoFar, extraSoFar) = byPlace.GetValueOrDefault(key);

                byPlace[key] = (
                    nightSoFar + (place.NightMultiplier > 1m ? night : 0),
                    extraSoFar + earned);
            }
        }

        return byPlace;
    }

    /// <summary>
    /// Whether a shift touches a public holiday, judged by the hours rather
    /// than by the date it happens to be filed under. A shift running
    /// 22:00 to 06:00 on the 31st spends most of itself on the 1st, and reading
    /// only the 31st paid the holiday rate on exactly the wrong nights.
    /// </summary>
    private static bool HolidayHours(DayShift entry, DateOnly date, Location place)
    {
        if (Holidays.IsPublicHoliday(place.HolidayCountry, date)) return true;

        // Past midnight the shift is on the next day, so that day's status
        // counts too. Only whole-shift for now: the premium itself is applied
        // to the whole shift, and splitting it is a separate change.
        bool wraps = entry.EndTime <= entry.StartTime;

        return wraps && Holidays.IsPublicHoliday(place.HolidayCountry, date.AddDays(1));
    }

    /// <summary>
    /// Worked hours and pay per place of work. Shifts with no location are
    /// grouped under id 0 rather than dropped, so the parts still sum.
    /// </summary>
    internal static LocationTotalDto[] ByLocation(
        Day[] days,
        Dictionary<int, Location> locations,
        Day[]? around = null)
    {
        // Tips and sales sit on the day, not on a shift, so a day split between
        // two places shares them out by the hours each place got. Anything else
        // would hand one location money the other earned.
        Dictionary<int, LocationAccumulator> totals = [];

        // The three figures that used to exist only in the headline. Without
        // them a place with a monthly salary reported no tax, no holiday
        // accrual and — the expensive one — an "expected" of zero, so a whole
        // unpaid wage never showed up as owed.
        Dictionary<int, decimal> periodPay = PeriodSalaryByPlace(days, workedOnly: true, around);

        // Overtime is reckoned over whole weeks and reported only for the days
        // asked about, so a week straddling a month boundary reaches its
        // threshold instead of falling short in both months.
        var overtime = days.Length == 0
            ? []
            : OvertimeByPlace(
                around ?? days,
                locations,
                days.Min(day => day.Date),
                days.Max(day => day.Date));

        var premiums = PremiumsByPlace(days, locations);

        foreach (Day day in days)
        {
            DaySplit split = SplitOf(day);
            DayShift[] worked = (day.Shifts ?? []).Where(entry => entry.Worked).ToArray();

            foreach (int key in split.Weight.Keys)
            {
                DayShift[] here = worked
                    .Where(entry => (entry.Shift?.LocationId ?? 0) == key)
                    .ToArray();

                decimal share = split.Share(key);

                if (!totals.TryGetValue(key, out LocationAccumulator? bucket))
                {
                    Location? place = (day.Shifts ?? [])
                        .Where(entry => (entry.Shift?.LocationId ?? 0) == key)
                        .Select(entry => entry.Shift?.Location)
                        .FirstOrDefault(location => location is not null);

                    // The rules come from the map, not from the navigation
                    // property: a no-tracking read gives a fresh Location
                    // instance per day and only the map is authoritative.
                    locations.TryGetValue(key, out Location? rules);

                    bucket = new LocationAccumulator
                    {
                        Name = place?.Name ?? "No location",
                        Colour = place?.Colour ?? "#8D97A5",
                        Currency = rules?.Currency ?? string.Empty,
                        TaxPercent = rules?.TaxPercent ?? 0m,
                        TaxTips = rules?.TaxTips ?? false,
                        HolidayPercent = rules?.HolidayPercent ?? 0m,
                    };

                    totals[key] = bucket;
                }

                bucket.Hours += here.Sum(entry => entry.PaidDuration.TotalHours);
                bucket.ShiftPay += here.Sum(entry => entry.Pay);
                bucket.Tips += split.Tips * share;
                bucket.Sales += split.Sales * share;
                bucket.TipOut += split.TipOut(key, locations);
                bucket.Deductions += split.Deductions(key, locations);
                if (here.Length > 0) bucket.Days += 1;
            }
        }

        // Added once at the end rather than per day: a weekly wage belongs to
        // its week, not to each day of it, and the overtime and premium figures
        // are already whole.
        foreach (var (key, amount) in periodPay)
            Bucket(totals, key, locations).ShiftPay += amount;

        foreach (var (key, pair) in overtime)
            Bucket(totals, key, locations).ShiftPay += pair.Extra;

        foreach (var (key, pair) in premiums)
            Bucket(totals, key, locations).ShiftPay += pair.Extra;

        return totals
            .Select(pair =>
            {
                LocationAccumulator bucket = pair.Value;
                decimal earned = bucket.ShiftPay + bucket.Tips + bucket.Sales
                    - bucket.TipOut - bucket.Deductions;

                // Tax is charged on what the place declares. Tips are in or out
                // depending on the house rule, and tip-out is never taxed —
                // that money was handed on before it was ever income.
                decimal taxable = bucket.ShiftPay + bucket.Sales
                    + (bucket.TaxTips ? bucket.Tips - bucket.TipOut : 0m);
                decimal tax = Math.Max(0m, taxable) * bucket.TaxPercent / 100m;

                // Holiday accrues on the wage only, and is owed later: it is
                // reported beside the totals, never added to them.
                decimal holiday = bucket.ShiftPay * bucket.HolidayPercent / 100m;

                LocationTotalDto total = new LocationTotalDto(
                    pair.Key,
                    bucket.Name,
                    bucket.Colour,
                    Math.Round(bucket.Hours, 2),
                    earned,
                    bucket.Days,
                    bucket.Tips,
                    bucket.Sales,
                    bucket.TipOut,
                    bucket.Deductions,
                    bucket.Hours == 0 ? 0m : earned / (decimal)bucket.Hours,
                    tax,
                    earned - tax,
                    holiday,
                    bucket.Currency);

                // The journey, where the place knows about one. Worked out from
                // the finished total so it can never drift from the hours and
                // the take-home it is a comparison against.
                return locations.TryGetValue(pair.Key, out Location? where)
                    ? total with { commute = CommuteMath.For(where, total) }
                    : total;
            })
            .OrderByDescending(total => total.earned)
            .ToArray();
    }

    /// <summary>
    /// The bucket for a place, made if it is not there yet. A place can owe a
    /// monthly wage in a range where the daily figures happen to be empty.
    /// </summary>
    private static LocationAccumulator Bucket(
        Dictionary<int, LocationAccumulator> totals,
        int key,
        Dictionary<int, Location> locations)
    {
        if (totals.TryGetValue(key, out LocationAccumulator? found)) return found;

        locations.TryGetValue(key, out Location? rules);

        LocationAccumulator made = new LocationAccumulator
        {
            Name = rules?.Name ?? "No location",
            Colour = rules?.Colour ?? "#8D97A5",
            Currency = rules?.Currency ?? string.Empty,
            TaxPercent = rules?.TaxPercent ?? 0m,
            TaxTips = rules?.TaxTips ?? false,
            HolidayPercent = rules?.HolidayPercent ?? 0m,
        };

        totals[key] = made;

        return made;
    }

    private sealed class LocationAccumulator
    {
        public string Name = string.Empty;
        public string Colour = string.Empty;
        public string Currency = string.Empty;
        public decimal TaxPercent;
        public bool TaxTips;
        public decimal HolidayPercent;
        public double Hours;
        public decimal ShiftPay;
        public decimal Tips;
        public decimal Sales;
        public decimal TipOut;
        public decimal Deductions;
        public int Days;
    }

    /// <summary>
    /// What the day owes support staff. The rule belongs to the place, so a day
    /// with no located shifts tips out nothing.
    /// </summary>
    /// <summary>
    /// Everything the day cost: the staff meal withheld by the place plus any
    /// fine recorded on the day.
    /// </summary>
    /// <summary>
    /// The reasons a day can cost money. Anything unrecognised — including
    /// what an older client sends, which is nothing — reads as unsaid rather
    /// than as "other": the app should not put words in anybody's mouth.
    /// </summary>
    private static string? ParseDeductionReason(string? value) => value?.ToLowerInvariant() switch
    {
        "breakage" => "breakage",
        "shortfall" => "shortfall",
        "late" => "late",
        "waste" => "waste",
        "uniform" => "uniform",
        "other" => "other",
        _ => null
    };

    /// <summary>
    /// Fines grouped by what caused them, largest first, over a range of days.
    /// Meal withholding is deliberately absent: it is agreed in advance and
    /// nothing went wrong, so putting it beside a till shortfall would blunt
    /// the only number on the page worth arguing about.
    /// </summary>
    public static DeductionReasonDto[] ByReason(IEnumerable<Day> days)
        => days
            .Where(day => (day.Deductions ?? 0m) > 0m)
            .GroupBy(day => day.DeductionReason ?? "unsaid")
            .Select(group => new DeductionReasonDto(
                group.Key,
                group.Sum(day => day.Deductions ?? 0m),
                group.Count()))
            .OrderByDescending(entry => entry.amount)
            .ThenBy(entry => entry.reason)
            .ToArray();

    private static decimal DeductionsFor(Day day, Dictionary<int, Location> locations)
    {
        DaySplit split = SplitOf(day);

        return split.Weight.Keys.Sum(place => split.Deductions(place, locations));
    }

    /// <summary>
    /// How one day divides between the places worked on it.
    ///
    /// Written once because three separate readings of it disagreed. Tip-out
    /// took the rule of whichever place happened to be listed first and applied
    /// it to the whole day — including the other employer's tips — and the
    /// order was not even stable. The staff meal was pooled across places and
    /// then re-split by hours, so one bar's lunch was charged to the cafe next
    /// door, and to that cafe's line in the reconciliation.
    /// </summary>
    private sealed record DaySplit(
        Dictionary<int, double> Weight,
        double Hours,
        decimal Tips,
        decimal Sales,
        decimal GrossSales,
        decimal Fine,
        /// <summary>
        /// The places actually worked today, which is not the same as the
        /// places on today. A day holding nothing but a plan still has to be
        /// attributed somewhere — see SplitOf — and that fallback names the
        /// place, which is right for the money and wrong for the meal.
        /// </summary>
        HashSet<int> Worked)
    {
        public double Total => Weight.Values.Sum();

        public decimal Share(int place)
            => Total <= 0 ? 0m : (decimal)(Weight.GetValueOrDefault(place) / Total);

        /// <summary>Each place's own rule, on its own share of the day.</summary>
        public decimal TipOut(int place, Dictionary<int, Location> locations)
        {
            if (!locations.TryGetValue(place, out Location? rules)) return 0m;

            decimal share = Share(place);

            return Tips * share * rules.TipOutOfTipsPercent / 100m
                + GrossSales * share * rules.TipOutOfSalesPercent / 100m;
        }

        /// <summary>
        /// The fine follows the hours, because a fine belongs to the day. The
        /// staff meal does not: it is a house rule of one place, charged once
        /// for the day worked there.
        ///
        /// "Worked there" being the point. Charged on presence alone, a
        /// Saturday with next week's shift pencilled in read as minus eighty:
        /// the calendar showed a day in the red for a meal nobody has eaten
        /// yet, on a shift nobody has been to.
        /// </summary>
        public decimal Deductions(int place, Dictionary<int, Location> locations)
            => Fine * Share(place)
                + (Worked.Contains(place) && locations.TryGetValue(place, out Location? rules)
                    ? rules.MealDeduction
                    : 0m);
    }

    /// <summary>The zone as the wire writes it. "unset" is an answer, not a gap.</summary>
    private static string ZoneName(ShiftZone zone) => zone switch
    {
        ShiftZone.Hall => "hall",
        ShiftZone.Bar => "bar",
        ShiftZone.Terrace => "terrace",
        ShiftZone.Banquet => "banquet",
        ShiftZone.Takeaway => "takeaway",
        _ => "unset",
    };

    /// <summary>
    /// Anything unrecognised reads as "not said" rather than throwing. A zone
    /// is a label on somebody's own evening; refusing a save over one would be
    /// losing the shift to protect a category.
    /// </summary>
    private static ShiftZone ParseZone(string value) => value.Trim().ToLowerInvariant() switch
    {
        "hall" => ShiftZone.Hall,
        "bar" => ShiftZone.Bar,
        "terrace" => ShiftZone.Terrace,
        "banquet" => ShiftZone.Banquet,
        "takeaway" => ShiftZone.Takeaway,
        _ => ShiftZone.Unset,
    };

    private static DaySplit SplitOf(Day day)
    {
        DayShift[] worked = (day.Shifts ?? []).Where(entry => entry.Worked).ToArray();

        double hours = worked.Sum(entry => entry.PaidDuration.TotalHours);

        // Hours where there are hours. A day whose worked shifts price by the
        // day, or whose only money is tips on a shift still marked planned,
        // still has to land somewhere — otherwise it stays in the total and
        // disappears from every per-place figure, and the parts stop summing
        // to the whole.
        Dictionary<int, double> weight;

        if (hours > 0)
        {
            weight = worked
                .GroupBy(entry => entry.Shift?.LocationId ?? 0)
                .ToDictionary(group => group.Key, group => group.Sum(e => e.PaidDuration.TotalHours));
        }
        else
        {
            DayShift[] present = worked.Length > 0 ? worked : (day.Shifts ?? []).ToArray();

            weight = present.Length > 0
                ? present
                    .GroupBy(entry => entry.Shift?.LocationId ?? 0)
                    .ToDictionary(group => group.Key, group => (double)group.Count())
                : new Dictionary<int, double> { [0] = 1 };
        }

        return new DaySplit(
            weight,
            hours,
            day.Tips ?? 0m,
            (day.Sales ?? []).Sum(entry => entry.Earned),
            (day.Sales ?? []).Sum(entry => entry.Quantity * entry.UnitPrice),
            day.Deductions ?? 0m,
            worked.Select(entry => entry.Shift?.LocationId ?? 0).ToHashSet());
    }

    private static decimal TipOutFor(Day day, Dictionary<int, Location> locations)
    {
        DaySplit split = SplitOf(day);

        return split.Weight.Keys.Sum(place => split.TipOut(place, locations));
    }

    /// <summary>
    /// A weekly or monthly wage is earned once per period, however many shifts
    /// fall inside it. So each template is charged per distinct week or month
    /// in which it was actually worked, not per day.
    /// </summary>
    /// <summary>
    /// Which week or month a placement's wage belongs to. Weeks are ISO, so a
    /// week straddling New Year still counts as one week.
    /// </summary>
    private static (int ShiftId, int Year, int Slot) SlotOf(DayShift entry, DateOnly date)
    {
        DateTime moment = date.ToDateTime(TimeOnly.MinValue);

        return entry.SalaryPeriod == SalaryPeriod.Week
            ? (entry.ShiftId, ISOWeek.GetYear(moment), ISOWeek.GetWeekOfYear(moment))
            : (entry.ShiftId, date.Year, date.Month);
    }

    /// <summary>
    /// Public because it is the only correct way to count a weekly or monthly
    /// wage, and there is now more than one caller. Anything that sums
    /// <see cref="DayShift.Pay"/> alone silently reports nothing for everybody
    /// on a salary — see the remarks below for why the share is per worked day.
    /// </summary>
    public static decimal PeriodSalary(Day[] days, bool workedOnly, Day[]? around = null)
        => PeriodSalaryByPlace(days, workedOnly, around).Values.Sum();

    /// <summary>
    /// Weekly and monthly wages, counted once per period they cover and
    /// attributed to the place that owes them. Without the attribution the
    /// whole of somebody's salary was missing from that place's tax, its
    /// holiday accrual and — worst of all — from what the reconciliation says
    /// it is owed.
    /// </summary>
    // Public for the same reason PeriodSalary is: the chronicle needs each
    // place's share of the period wages, and reimplementing the split there
    // would fork the one formula this guard-tested file owns.
    public static Dictionary<int, decimal> PeriodSalaryByPlace(
        Day[] days,
        bool workedOnly,
        Day[]? around = null)
    {
        Dictionary<int, decimal> byPlace = [];

        if (days.Length == 0) return byPlace;

        // How many days of each period were worked, counted over a window
        // wider than the range. A salary is earned across the whole month, so
        // ten days of it are worth ten days' share — asking for the first
        // third of August and being told the whole month's wage is the one
        // place in the app where the answer depended on where you drew the
        // line, and two adjacent ranges added up to twice the truth.
        Dictionary<(int, int, int), int> inPeriod = [];

        foreach (Day day in around ?? days)
        {
            foreach (DayShift entry in day.Shifts ?? [])
            {
                if (!entry.IsPeriodSalary) continue;
                if (workedOnly && !entry.Worked) continue;

                var key = SlotOf(entry, day.Date);

                inPeriod[key] = inPeriod.GetValueOrDefault(key) + 1;
            }
        }

        foreach (Day day in days)
        {
            foreach (DayShift entry in day.Shifts ?? [])
            {
                if (!entry.IsPeriodSalary) continue;
                if (workedOnly && !entry.Worked) continue;

                var slot = SlotOf(entry, day.Date);

                // The day's share of its period's wage. Days worked in the
                // period, not calendar days: a month with five shifts in it
                // pays the salary over those five, so any range containing
                // them adds up to the salary and no range containing none of
                // them claims a penny of it.
                int worked = inPeriod.GetValueOrDefault(slot);

                if (worked <= 0) continue;

                int place = entry.Shift?.LocationId ?? 0;

                byPlace[place] = byPlace.GetValueOrDefault(place)
                    + (entry.SalaryAmount ?? 0m) / worked;
            }
        }

        return byPlace;
    }

    /// <summary>
    /// Locations are needed for the tip-out, so the day-level view takes them
    /// too; an empty map simply means no rule applies.
    /// </summary>
    private static DayDto ToDto(Day day) => ToDto(day, []);

    private static DayDto ToDto(Day day, Dictionary<int, Location> locations)
    {
        decimal tipOut = TipOutFor(day, locations);
        decimal deductions = DeductionsFor(day, locations);

        DaySaleDto[] sales = (day.Sales ?? [])
            .Select(entry => new DaySaleDto(
                entry.SalesId,
                entry.Sales?.Name ?? string.Empty,
                entry.Quantity,
                entry.UnitPrice,
                entry.Percentage,
                entry.Earned))
            .ToArray();

        DayShiftDto[] shifts = (day.Shifts ?? [])
            .Select(entry => new DayShiftDto(
                entry.ShiftId,
                entry.Shift?.Name ?? string.Empty,
                entry.Shift?.Symbol,
                // The template's own colour first: two shifts at one place
                // are the case this exists for, and they would otherwise be
                // the same colour as each other.
                entry.Shift?.Colour ?? entry.Shift?.Location?.Colour,
                entry.StartTime.ToString("HH:mm"),
                entry.EndTime.ToString("HH:mm"),
                Math.Round(entry.PaidDuration.TotalHours, 2),
                entry.Pay,
                entry.Revenue,
                entry.Guests,
                ZoneName(entry.Zone),
                entry.RevenuePercent,
                entry.Worked,
                entry.NeedsCover,
                entry.ActualStart?.ToString("HH:mm"),
                entry.ActualEnd?.ToString("HH:mm"),
                entry.BreakMinutes))
            .ToArray();

        decimal salesPay = sales.Sum(entry => entry.earned);
        decimal workedPay = shifts.Where(s => s.worked).Sum(s => s.earned);
        decimal plannedPay = shifts.Where(s => !s.worked).Sum(s => s.earned);

        return new DayDto(
            day.Date,
            shifts,
            sales,
            day.Tips,
            day.TipsCash,
            day.TipPool,
            tipOut,
            deductions,
            day.DeductionReason,
            day.Note,
            // A day painted by hand wins; otherwise the first shift that says
            // it paints days lends its colour. Standing rule, single answer:
            // both clients would otherwise invent their own.
            day.Colour
                ?? (day.Shifts ?? [])
                    .Select(entry => entry.Shift)
                    .FirstOrDefault(shift => shift is { PaintsDay: true })
                    ?.Colour,
            BelowFloor(day, locations),
            Math.Round(shifts.Where(s => s.worked).Sum(s => s.hours), 2),
            workedPay + salesPay + (day.Tips ?? 0m) - tipOut - deductions,
            plannedPay,
            day.Version
        );
    }

    /// <summary>
    /// Whether any worked shift on this day came out under the floor its place
    /// is set to. Judged per shift rather than per day: a good evening does not
    /// make an underpaid morning acceptable, and averaging them hides it.
    /// </summary>
    private static bool BelowFloor(Day day, Dictionary<int, Location> locations)
    {
        foreach (var entry in day.Shifts ?? [])
        {
            if (!entry.Worked) continue;
            if (entry.Shift?.LocationId is not int placeId) continue;
            if (!locations.TryGetValue(placeId, out var place)) continue;
            if (place.MinimumHourly <= 0m) continue;

            var hours = (decimal)entry.PaidDuration.TotalHours;

            // No hours means no rate to judge: a period wage lands on the
            // range, not on the shift, and dividing by zero is not a verdict.
            if (hours <= 0m) continue;

            if (entry.Pay / hours < place.MinimumHourly) return true;
        }

        return false;
    }

    [GeneratedRegex("^#[0-9A-Fa-f]{6}$")]
    private static partial Regex HexColour();
}
