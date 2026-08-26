using System.Globalization;
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

    // The audit hand is optional so the unit tests, which build this by
    // hand around fakes, stay ignorant of it.
    public DayHandler(IShifterCommand shifterCommand, IShifterQuery shifterQuery, DayAuditWriter? audit = null)
    {
        _shifterCommand = shifterCommand;
        _shifterQuery = shifterQuery;
        _audit = audit;
    }

    public async Task<DaysDto> ListAsync(
        int userId,
        DateOnly from,
        DateOnly to,
        CancellationToken ct)
    {
        if (from > to)
            throw new ValidationException("Range start must not be after its end.");

        Day[] days = await _shifterQuery.GetDaysInRangeAsync(userId, from, to, ct);
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
        decimal periodEarned = PeriodSalary(days, workedOnly: true);
        decimal shiftsEarned = worked.Sum(entry => entry.Pay);

        var (overtimeHours, overtimeExtra) = Overtime(days, byId);

        decimal tipOut = days.Sum(day => TipOutFor(day, byId));
        decimal deductions = days.Sum(day => DeductionsFor(day, byId));

        decimal totalEarned =
            shiftsEarned + salesEarned + tipsEarned + periodEarned + overtimeExtra
            - tipOut - deductions;
        decimal plannedEarned =
            planned.Sum(entry => entry.Pay) + PeriodSalary(days, workedOnly: false)
            - periodEarned;

        decimal paid = payouts.Sum(payout => payout.Amount);

        LocationTotalDto[] byLocation = ByLocation(days, byId);

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
            tax,
            totalEarned - tax,
            holiday,
            currencies,
            byLocation,
            overtimeHours,
            overtimeExtra,
            events.Select(EventHandler.ToDto).ToArray()
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

        List<DayShift> shifts = await ResolveShiftsAsync(request.shifts, userId, date, ct);
        List<DaySale> sales = await ResolveSalesAsync(request.sales, userId, ct);

        Day incoming = new Day()
        {
            UserId = userId,
            Date = date,
            Shifts = shifts,
            Sales = sales,
            Tips = request.tips,
            TipsCash = request.tips_cash,
            Deductions = request.deductions,
            Note = string.IsNullOrWhiteSpace(request.note) ? null : request.note.Trim(),
            Colour = NormaliseColour(request.colour)
        };

        Day saved = await _shifterCommand.UpsertDayAsync(incoming, ct);

        if (_audit is not null) await _audit.WriteAsync(userId, saved, "app", ct);

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
            userId, request.dates, shifts[0], add, ct);

        Location[] places = await _shifterQuery.GetLocationsAsync(userId, true, ct);
        Dictionary<int, Location> byId = places.ToDictionary(place => place.Id);

        return touched.Select(day => ToDto(day, byId)).ToArray();
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
    private static (double Hours, decimal Extra) Overtime(
        Day[] days,
        Dictionary<int, Location> locations)
    {
        var byWeek = days
            .SelectMany(day => (day.Shifts ?? []).Select(entry => (day.Date, entry)))
            .Where(pair => pair.entry.Worked)
            .GroupBy(pair => (
                Location: pair.entry.Shift?.LocationId ?? 0,
                Year: ISOWeek.GetYear(pair.Date.ToDateTime(TimeOnly.MinValue)),
                Week: ISOWeek.GetWeekOfYear(pair.Date.ToDateTime(TimeOnly.MinValue))));

        double overtimeHours = 0;
        decimal extra = 0m;

        foreach (var week in byWeek)
        {
            locations.TryGetValue(week.Key.Location, out Location? place);

            double threshold = place?.OvertimeWeeklyHours ?? DefaultOvertimeHours;
            decimal multiplier = place?.OvertimeMultiplier ?? DefaultOvertimeMultiplier;

            double running = 0;

            foreach (var (_, entry) in week.OrderBy(pair => pair.Date))
            {
                double hours = entry.PaidDuration.TotalHours;
                double before = running;

                running += hours;

                if (running <= threshold) continue;

                // Only the part of this shift that sits past the line.
                double over = running - Math.Max(before, threshold);

                overtimeHours += over;

                if (entry.SalaryPeriod != SalaryPeriod.Hour) continue;

                extra += (decimal)over * (entry.SalaryAmount ?? 0m) * (multiplier - 1m);
            }
        }

        return (Math.Round(overtimeHours, 2), extra);
    }

    /// <summary>
    /// Worked hours and pay per place of work. Shifts with no location are
    /// grouped under id 0 rather than dropped, so the parts still sum.
    /// </summary>
    internal static LocationTotalDto[] ByLocation(
        Day[] days,
        Dictionary<int, Location> locations)
    {
        // Tips and sales sit on the day, not on a shift, so a day split between
        // two places shares them out by the hours each place got. Anything else
        // would hand one location money the other earned.
        Dictionary<int, LocationAccumulator> totals = [];

        foreach (Day day in days)
        {
            DayShift[] worked = (day.Shifts ?? []).Where(entry => entry.Worked).ToArray();

            if (worked.Length == 0) continue;

            double dayHours = worked.Sum(entry => entry.PaidDuration.TotalHours);
            decimal dayTips = day.Tips ?? 0m;
            decimal daySales = (day.Sales ?? []).Sum(entry => entry.Earned);
            decimal dayTipOut = TipOutFor(day, locations);
            decimal dayDeductions = DeductionsFor(day, locations);

            foreach (var group in worked.GroupBy(entry => entry.Shift?.LocationId ?? 0))
            {
                double groupHours = group.Sum(entry => entry.PaidDuration.TotalHours);
                decimal share = dayHours == 0 ? 0m : (decimal)(groupHours / dayHours);

                if (!totals.TryGetValue(group.Key, out LocationAccumulator? bucket))
                {
                    Location? place = group
                        .Select(entry => entry.Shift?.Location)
                        .FirstOrDefault(location => location is not null);

                    // The rules come from the map, not from the navigation
                    // property: a no-tracking read gives a fresh Location
                    // instance per day and only the map is authoritative.
                    locations.TryGetValue(group.Key, out Location? rules);

                    bucket = new LocationAccumulator
                    {
                        Name = place?.Name ?? "No location",
                        Colour = place?.Colour ?? "#8D97A5",
                        Currency = rules?.Currency ?? string.Empty,
                        TaxPercent = rules?.TaxPercent ?? 0m,
                        TaxTips = rules?.TaxTips ?? false,
                        HolidayPercent = rules?.HolidayPercent ?? 0m,
                    };

                    totals[group.Key] = bucket;
                }

                bucket.Hours += groupHours;
                bucket.ShiftPay += group.Sum(entry => entry.Pay);
                bucket.Tips += dayTips * share;
                bucket.Sales += daySales * share;
                bucket.TipOut += dayTipOut * share;
                bucket.Deductions += dayDeductions * share;
                bucket.Days += 1;
            }
        }

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

                return new LocationTotalDto(
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
            })
            .OrderByDescending(total => total.earned)
            .ToArray();
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
    private static decimal DeductionsFor(Day day, Dictionary<int, Location> locations)
    {
        decimal fines = day.Deductions ?? 0m;
        decimal meals = 0m;

        // One meal per place worked that day, not per shift: a split shift at
        // the same restaurant is still one sitting.
        foreach (int locationId in (day.Shifts ?? [])
            .Where(entry => entry.Worked)
            .Select(entry => entry.Shift?.LocationId ?? 0)
            .Distinct())
        {
            if (locations.TryGetValue(locationId, out Location? place))
                meals += place.MealDeduction;
        }

        return fines + meals;
    }

    private static decimal TipOutFor(Day day, Dictionary<int, Location> locations)
    {
        DayShift[] worked = (day.Shifts ?? []).Where(entry => entry.Worked).ToArray();

        if (worked.Length == 0) return 0m;

        Location? place = worked
            .Select(entry =>
                entry.Shift?.LocationId is int id && locations.TryGetValue(id, out Location? l)
                    ? l
                    : null)
            .FirstOrDefault(location => location is not null);

        if (place is null) return 0m;

        decimal tips = day.Tips ?? 0m;
        decimal sales = (day.Sales ?? []).Sum(entry => entry.Quantity * entry.UnitPrice);

        return tips * place.TipOutOfTipsPercent / 100m
            + sales * place.TipOutOfSalesPercent / 100m;
    }

    /// <summary>
    /// A weekly or monthly wage is earned once per period, however many shifts
    /// fall inside it. So each template is charged per distinct week or month
    /// in which it was actually worked, not per day.
    /// </summary>
    private static decimal PeriodSalary(Day[] days, bool workedOnly)
    {
        HashSet<(int ShiftId, int Year, int Slot)> counted = [];
        decimal total = 0m;

        foreach (Day day in days)
        {
            foreach (DayShift entry in day.Shifts ?? [])
            {
                if (!entry.IsPeriodSalary) continue;
                if (workedOnly && !entry.Worked) continue;

                DateTime date = day.Date.ToDateTime(TimeOnly.MinValue);

                int slot = entry.SalaryPeriod == SalaryPeriod.Week
                    ? ISOWeek.GetWeekOfYear(date)
                    : day.Date.Month;

                int year = entry.SalaryPeriod == SalaryPeriod.Week
                    ? ISOWeek.GetYear(date)
                    : day.Date.Year;

                if (counted.Add((entry.ShiftId, year, slot)))
                    total += entry.SalaryAmount ?? 0m;
            }
        }

        return total;
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
            tipOut,
            deductions,
            day.Note,
            day.Colour,
            Math.Round(shifts.Where(s => s.worked).Sum(s => s.hours), 2),
            workedPay + salesPay + (day.Tips ?? 0m) - tipOut - deductions,
            plannedPay
        );
    }

    [GeneratedRegex("^#[0-9A-Fa-f]{6}$")]
    private static partial Regex HexColour();
}
