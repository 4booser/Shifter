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

    public async Task<int> CountSalesUsageAsync(int salesId, CancellationToken ct)
    {
        return await _db.DaySales.CountAsync(entry => entry.SalesId == salesId, ct);
    }

    public async Task DeleteSalesAsync(Sales sales, CancellationToken ct)
    {
        _db.Sales.Remove(sales);
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

    public async Task SaveAsync(CancellationToken ct)
    {
        await _db.SaveChangesAsync(ct);
    }

    public async Task<Day[]> ApplyShiftAsync(
        int userId,
        DateOnly[] dates,
        Shift shift,
        bool add,
        CancellationToken ct)
    {
        Day[] existing = await _db.Days
            .Include(day => day.Shifts)
            .Include(day => day.Sales)
            .Where(day => day.UserId == userId && dates.Contains(day.Date))
            .ToArrayAsync(ct);

        Dictionary<DateOnly, Day> byDate = existing.ToDictionary(day => day.Date);
        DateOnly today = DateOnly.FromDateTime(DateTime.UtcNow);
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

        existing.Tips = incoming.Tips;
        existing.Note = incoming.Note;

        // The client always sends the day in full, so replacing beats diffing:
        // there is no partial update to reconcile. The old rows go explicitly
        // because both sides are owned entities now, not a join table EF can
        // rewire by itself.
        if (existing.Shifts is { Count: > 0 })
            _db.DayShifts.RemoveRange(existing.Shifts);

        existing.Shifts = incoming.Shifts;

        if (existing.Sales is { Count: > 0 })
            _db.DaySales.RemoveRange(existing.Sales);

        existing.Sales = incoming.Sales;

        await _db.SaveChangesAsync(ct);

        return existing;
    }
}
