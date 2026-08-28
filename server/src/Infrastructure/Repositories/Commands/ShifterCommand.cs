using Microsoft.EntityFrameworkCore;
using Shifter.Domain.Entities;
using Shifter.Infrastructure.Persistence.DbContexts;
using Shifter.Infrastructure.Repositories.Interfaces;

namespace Shifter.Infrastructure.Repositories.Commands;

public class ShifterCommand : IShifterCommand
{
    private readonly ShifterDbContext _db;

    public ShifterCommand(ShifterDbContext db) => _db = db;

    public async Task<bool> AddDayAsync(Day day, CancellationToken ct)
    {
        await _db.AddAsync(day, ct);
        return await _db.SaveChangesAsync(ct) > 0;
    }

    public async Task<bool> AddShiftAsync(Shift shift, CancellationToken ct)
    {
        await _db.Shifts.AddAsync(shift, ct);
        return await _db.SaveChangesAsync(ct) > 0;
    }

    public async Task<bool> AddSalesAsync(Sales sales, CancellationToken ct)
    {
        await _db.Sales.AddAsync(sales, ct);
        return await _db.SaveChangesAsync(ct) > 0;
    }

    public async Task<bool> AddLocationAsync(Location location, CancellationToken ct)
    {
        await _db.Locations.AddAsync(location, ct);
        return await _db.SaveChangesAsync(ct) > 0;
    }

    public async Task<int> CountShiftsAtLocationAsync(int locationId, CancellationToken ct)
    {
        return await _db.Shifts.CountAsync(shift => shift.LocationId == locationId, ct);
    }

    public async Task DeleteLocationAsync(Location location, CancellationToken ct)
    {
        _db.Locations.Remove(location);
        await _db.SaveChangesAsync(ct);
    }

    public async Task DetachShiftsFromLocationAsync(int locationId, CancellationToken ct)
    {
        // The templates outlive the place: a shift with no location still has
        // its own hours and rate, and deleting them alongside would take the
        // days they sit on with them.
        await _db.Shifts
            .Where(shift => shift.LocationId == locationId)
            .ExecuteUpdateAsync(setters => setters.SetProperty(s => s.LocationId, _ => null), ct);
    }

    public async Task<int> CountSalesUsageAsync(int salesId, CancellationToken ct)
    {
        return await _db.DaySales.CountAsync(entry => entry.SalesId == salesId, ct);
    }

    public async Task DeleteSalesAsync(Sales sales, CancellationToken ct)
    {
        _db.Sales.Remove(sales);
        await _db.SaveChangesAsync(ct);
    }

    public async Task<bool> AddGoalAsync(Goal item, CancellationToken ct)
    {
        await _db.Goals.AddAsync(item, ct);
        return await _db.SaveChangesAsync(ct) > 0;
    }

    public async Task UpdateGoalAsync(Goal item, CancellationToken ct)
        => await _db.SaveChangesAsync(ct);

    public async Task DeleteGoalAsync(Goal item, CancellationToken ct)
    {
        _db.Goals.Remove(item);
        await _db.SaveChangesAsync(ct);
    }

    public async Task<bool> AddEventAsync(Event item, CancellationToken ct)
    {
        await _db.Events.AddAsync(item, ct);
        return await _db.SaveChangesAsync(ct) > 0;
    }

    public async Task DeleteEventAsync(Event item, CancellationToken ct)
    {
        _db.Events.Remove(item);
        await _db.SaveChangesAsync(ct);
    }

    public async Task<bool> AddExpenseAsync(WorkExpense expense, CancellationToken ct)
    {
        await _db.Expenses.AddAsync(expense, ct);
        return await _db.SaveChangesAsync(ct) > 0;
    }

    public async Task DeleteExpenseAsync(WorkExpense expense, CancellationToken ct)
    {
        _db.Expenses.Remove(expense);
        await _db.SaveChangesAsync(ct);
    }

    public async Task<bool> AddPayoutAsync(Payout payout, CancellationToken ct)
    {
        await _db.Payouts.AddAsync(payout, ct);
        return await _db.SaveChangesAsync(ct) > 0;
    }

    public async Task DeletePayoutAsync(Payout payout, CancellationToken ct)
    {
        _db.Payouts.Remove(payout);
        await _db.SaveChangesAsync(ct);
    }

    public async Task SettlePeriodAsync(
        int userId, int locationId, DateOnly periodFrom, string stream,
        string? kind, string? note, CancellationToken ct)
    {
        PeriodSettlement? existing = await _db.PeriodSettlements.FirstOrDefaultAsync(
            entry => entry.UserId == userId
                && entry.LocationId == locationId
                && entry.PeriodFrom == periodFrom
                && entry.Stream == stream,
            ct);

        // No kind means "reopen it": the line was drawn by mistake, or the
        // conversation with the place started again.
        if (kind is null)
        {
            if (existing is not null) _db.PeriodSettlements.Remove(existing);
        }
        else if (existing is null)
        {
            _db.PeriodSettlements.Add(new PeriodSettlement
            {
                UserId = userId,
                LocationId = locationId,
                PeriodFrom = periodFrom,
                Stream = stream,
                Kind = kind,
                Note = note,
            });
        }
        else
        {
            existing.Kind = kind;
            existing.Note = note;
        }

        await _db.SaveChangesAsync(ct);
    }

    public async Task SaveAsync(CancellationToken ct)
    {
        await _db.SaveChangesAsync(ct);
    }

    public async Task<Day[]> ApplyColourAsync(
        int userId,
        Dictionary<DateOnly, string?> colours,
        CancellationToken ct)
    {
        DateOnly[] dates = colours.Keys.ToArray();

        Day[] existing = await _db.Days
            .Include(day => day.Shifts)
            .Include(day => day.Sales)
            .Where(day => day.UserId == userId && dates.Contains(day.Date))
            .ToArrayAsync(ct);

        Dictionary<DateOnly, Day> byDate = existing.ToDictionary(day => day.Date);
        List<Day> touched = [];

        foreach ((DateOnly date, string? colour) in colours)
        {
            if (!byDate.TryGetValue(date, out Day? day))
            {
                // Clearing a colour off a day that was never recorded has
                // nothing to clear, and creating an empty row to hold a null
                // would fill the calendar with days that say nothing.
                if (colour is null) continue;

                day = new Day { UserId = userId, Date = date };

                await _db.Days.AddAsync(day, ct);
                byDate[date] = day;
            }

            day.Colour = colour;
            touched.Add(day);
        }

        await _db.SaveChangesAsync(ct);

        return touched.ToArray();
    }

    public async Task<Day[]> ApplyShiftAsync(
        int userId,
        DateOnly[] dates,
        Shift shift,
        bool add,
        DateOnly today,
        CancellationToken ct)
    {
        Day[] existing = await _db.Days
            .Include(day => day.Shifts)
            .Include(day => day.Sales)
            .Where(day => day.UserId == userId && dates.Contains(day.Date))
            .ToArrayAsync(ct);

        Dictionary<DateOnly, Day> byDate = existing.ToDictionary(day => day.Date);
        List<Day> touched = [];

        foreach (DateOnly date in dates.Distinct())
        {
            if (!byDate.TryGetValue(date, out Day? day))
            {
                // Removing from a day that does not exist is a no-op rather
                // than a reason to create an empty row.
                if (!add) continue;

                day = new Day { UserId = userId, Date = date, Shifts = [] };

                await _db.Days.AddAsync(day, ct);
                byDate[date] = day;
            }

            day.Shifts ??= [];

            if (add)
            {
                if (day.Shifts.All(entry => entry.ShiftId != shift.Id))
                {
                    // A date already behind us is almost certainly worked; one
                    // ahead is a plan. The user can flip either in the panel.
                    day.Shifts.Add(DayShift.From(shift, worked: date <= today));
                }
            }
            else
            {
                List<DayShift> going = day.Shifts
                    .Where(entry => entry.ShiftId == shift.Id)
                    .ToList();

                _db.DayShifts.RemoveRange(going);
                day.Shifts.RemoveAll(entry => entry.ShiftId == shift.Id);
            }

            touched.Add(day);
        }

        // One save for the whole batch: a drag across a month is one round trip
        // and one transaction, not thirty of each.
        await _db.SaveChangesAsync(ct);

        return touched.ToArray();
    }

    public async Task<Day> MergeDaySalesAsync(
        int userId,
        DaySalesMerge incoming,
        CancellationToken ct)
    {
        Day day = await LoadOrStartDayAsync(userId, incoming.Date, ct);

        // Only what arrived. A delivery of tips alone leaves the note, the
        // colour and the cash split exactly as the person left them.
        if (incoming.Tips is not null) day.Tips = incoming.Tips;
        if (incoming.TipsCash is not null) day.TipsCash = incoming.TipsCash;
        if (incoming.Deductions is not null) day.Deductions = incoming.Deductions;
        if (incoming.Note is not null) day.Note = incoming.Note;

        day.Sales ??= [];

        foreach (DaySale entry in incoming.Sales)
        {
            DaySale? existing = day.Sales.FirstOrDefault(row => row.SalesId == entry.SalesId);

            // Nothing sold is how a correction removes a line: a till that
            // resends a day without an item means the item was voided.
            if (entry.Quantity <= 0)
            {
                if (existing is null) continue;

                _db.DaySales.Remove(existing);
                day.Sales.Remove(existing);

                continue;
            }

            if (existing is null)
            {
                day.Sales.Add(entry);

                continue;
            }

            // The price and share come from the catalogue as it stands now,
            // same as a day saved by hand: the delivery says how many, never
            // how much.
            existing.Quantity = entry.Quantity;
            existing.UnitPrice = entry.UnitPrice;
            existing.Percentage = entry.Percentage;
        }

        if (incoming.Replace)
        {
            int[] sent = incoming.Sales.Select(entry => entry.SalesId).ToArray();

            List<DaySale> going = day.Sales
                .Where(row => !sent.Contains(row.SalesId))
                .ToList();

            _db.DaySales.RemoveRange(going);
            day.Sales.RemoveAll(row => !sent.Contains(row.SalesId));
        }

        await _db.SaveChangesAsync(ct);

        return day;
    }

    public async Task<Day> MergeDayShiftAsync(
        int userId,
        DateOnly date,
        DayShift placement,
        CancellationToken ct)
    {
        Day day = await LoadOrStartDayAsync(userId, date, ct);

        day.Shifts ??= [];

        DayShift? existing = day.Shifts
            .FirstOrDefault(entry => entry.ShiftId == placement.ShiftId);

        if (existing is null)
        {
            day.Shifts.Add(placement);

            await _db.SaveChangesAsync(ct);

            return day;
        }

        // Corrected in place rather than replaced, so anything hanging off the
        // placement — a cover offer, the crew's view of it — survives a second
        // delivery of the same shift.
        existing.SalaryPeriod = placement.SalaryPeriod;
        existing.SalaryAmount = placement.SalaryAmount;
        existing.StartTime = placement.StartTime;
        existing.EndTime = placement.EndTime;
        existing.BreakMinutes = placement.BreakMinutes;
        existing.Worked = placement.Worked;

        await _db.SaveChangesAsync(ct);

        return day;
    }

    /// <summary>
    /// The day with its contents attached, tracked, created if this is the
    /// first thing to land on it. Not saved here: the caller has more to add.
    /// </summary>
    private async Task<Day> LoadOrStartDayAsync(int userId, DateOnly date, CancellationToken ct)
    {
        Day? existing = await _db.Days
            .Include(day => day.Shifts)
            .Include(day => day.Sales)
            .FirstOrDefaultAsync(day => day.UserId == userId && day.Date == date, ct);

        if (existing is not null) return existing;

        Day day = new Day { UserId = userId, Date = date, Shifts = [], Sales = [] };

        await _db.Days.AddAsync(day, ct);

        return day;
    }

    public async Task<Day> UpsertDayAsync(Day incoming, CancellationToken ct)
    {
        Day? existing = await _db.Days
            .Include(d => d.Shifts)
            .Include(d => d.Sales)
            .FirstOrDefaultAsync(
                d => d.UserId == incoming.UserId && d.Date == incoming.Date,
                ct);

        if (existing is null)
        {
            await _db.Days.AddAsync(incoming, ct);
            await _db.SaveChangesAsync(ct);

            return incoming;
        }

        // Every scalar the save carries, not a subset. Cash tips, deductions,
        // the tip pool and the fine's reason were each missing here at some
        // point and simply never persisted on a day that already existed: the
        // value came back correct in the response, built from the request, and
        // was gone by the next reload. The copy is derived from the entity now
        // so the next field cannot be forgotten.
        DayScalars.CopyOnto(existing, incoming);

        // A placement that is already on this day keeps the terms it was made
        // under and takes only the save's edits. Replacing it outright — which
        // is what this did — meant the snapshot on DayShift protected nothing:
        // reprice a template in April, open a March day to add a note, and
        // March silently earned more, while the raise vanished from a history
        // that is read out of these very snapshots.
        var (kept, dropped) = DayShiftEdit.Merge(existing.Shifts, incoming.Shifts);

        // Whatever nobody claimed was taken off the day.
        if (dropped.Count > 0) _db.DayShifts.RemoveRange(dropped);

        existing.Shifts = kept;

        if (existing.Sales is { Count: > 0 })
            _db.DaySales.RemoveRange(existing.Sales);

        existing.Sales = incoming.Sales;

        await _db.SaveChangesAsync(ct);

        return existing;
    }
}
