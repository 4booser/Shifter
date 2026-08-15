using System.Globalization;
using Shifter.Application.Common.Exceptions;
using Shifter.Application.Features.business.DTOs;
using Shifter.Application.Features.business.Services.Interfaces;
using Shifter.Domain.Entities;
using Shifter.Infrastructure.Repositories.Interfaces;

namespace Shifter.Application.Features.business.Services;

public class DayHandler : IDayHandler
{
    private const int NoteMaxLength = 500;
    private const int MaxBulkDates = 400;

    // Used for shifts with no place of work attached.
    private const double DefaultOvertimeHours = 40;
    private const decimal DefaultOvertimeMultiplier = 1.5m;

    private readonly IShifterCommand _shifterCommand;
    private readonly IShifterQuery _shifterQuery;

    public DayHandler(IShifterCommand shifterCommand, IShifterQuery shifterQuery)
    {
        _shifterCommand = shifterCommand;
        _shifterQuery = shifterQuery;
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

        DayDto[] dtos = days.Select(ToDto).ToArray();
        DayShift[] entries = days.SelectMany(day => day.Shifts ?? []).ToArray();

        DayShift[] worked = entries.Where(entry => entry.Worked).ToArray();
        DayShift[] planned = entries.Where(entry => !entry.Worked).ToArray();

        decimal salesEarned = dtos.SelectMany(day => day.sales).Sum(entry => entry.earned);
        decimal tipsEarned = days.Sum(day => day.Tips ?? 0m);
        decimal periodEarned = PeriodSalary(days, workedOnly: true);
        decimal shiftsEarned = worked.Sum(entry => entry.Pay);

        Location[] places = await _shifterQuery.GetLocationsAsync(userId, true, ct);
        Dictionary<int, Location> byId = places.ToDictionary(place => place.Id);

        var (overtimeHours, overtimeExtra) = Overtime(days, byId);

        decimal totalEarned =
            shiftsEarned + salesEarned + tipsEarned + periodEarned + overtimeExtra;
        decimal plannedEarned =
            planned.Sum(entry => entry.Pay) + PeriodSalary(days, workedOnly: false)
            - periodEarned;

        decimal paid = payouts.Sum(payout => payout.Amount);

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
            ByLocation(worked),
            overtimeHours,
            overtimeExtra
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

        if (request.tips < 0)
            throw new ValidationException("Tips cannot be negative.");

        List<DayShift> shifts = await ResolveShiftsAsync(request.shifts, userId, date, ct);
        List<DaySale> sales = await ResolveSalesAsync(request.sales, userId, ct);

        Day incoming = new Day()
        {
            UserId = userId,
            Date = date,
            Shifts = shifts,
            Sales = sales,
            Tips = request.tips,
            Note = string.IsNullOrWhiteSpace(request.note) ? null : request.note.Trim()
        };

        Day saved = await _shifterCommand.UpsertDayAsync(incoming, ct);

        return ToDto(saved);
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

        return touched.Select(ToDto).ToArray();
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
        Dictionary<int, bool> workedById = requested
            .GroupBy(entry => entry.shift_id)
            .ToDictionary(group => group.Key, group => group.Last().worked);

        int[] wanted = workedById.Keys.ToArray();

        Shift[] shifts = await _shifterQuery.GetShiftsByIdsAsync(userId, wanted, ct);

        // A short result means an id either does not exist or belongs to
        // someone else. Both get the same answer.
        if (shifts.Length != wanted.Length)
            throw new NotFoundException("Some shifts do not exist.");

        return shifts
            .Select(shift => DayShift.From(shift, workedById[shift.Id]))
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
    private static LocationTotalDto[] ByLocation(DayShift[] worked)
    {
        // Grouped by id, not by the navigation object: AsNoTracking hands back a
        // fresh Location instance per day, so grouping by reference would list
        // the same place once for every day it appears on.
        return worked
            .GroupBy(entry => entry.Shift?.LocationId ?? 0)
            .Select(group =>
            {
                Location? place = group
                    .Select(entry => entry.Shift?.Location)
                    .FirstOrDefault(location => location is not null);

                return new LocationTotalDto(
                    group.Key,
                    place?.Name ?? "No location",
                    place?.Colour ?? "#8D97A5",
                    Math.Round(group.Sum(entry => entry.PaidDuration.TotalHours), 2),
                    group.Sum(entry => entry.Pay));
            })
            .OrderByDescending(total => total.earned)
            .ToArray();
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

    private static DayDto ToDto(Day day)
    {
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
                entry.Shift?.Location?.Colour,
                entry.StartTime.ToString("HH:mm"),
                entry.EndTime.ToString("HH:mm"),
                Math.Round(entry.PaidDuration.TotalHours, 2),
                entry.Pay,
                entry.Worked))
            .ToArray();

        decimal salesPay = sales.Sum(entry => entry.earned);
        decimal workedPay = shifts.Where(s => s.worked).Sum(s => s.earned);
        decimal plannedPay = shifts.Where(s => !s.worked).Sum(s => s.earned);

        return new DayDto(
            day.Date,
            shifts,
            sales,
            day.Tips,
            day.Note,
            Math.Round(shifts.Where(s => s.worked).Sum(s => s.hours), 2),
            workedPay + salesPay + (day.Tips ?? 0m),
            plannedPay
        );
    }
}
