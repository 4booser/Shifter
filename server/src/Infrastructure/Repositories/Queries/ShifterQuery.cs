using Microsoft.EntityFrameworkCore;
using Shifter.Domain.Entities;
using Shifter.Infrastructure.Persistence.DbContexts;
using Shifter.Infrastructure.Repositories.Interfaces;

namespace Shifter.Infrastructure.Repositories.Queries;

public class ShifterQuery : IShifterQuery
{
    private readonly ShifterDbContext _db;
    public ShifterQuery(ShifterDbContext db) => _db = db;

    /// <summary>
    /// One round trip for a whole set of ids, scoped to the owner and to live
    /// templates. Someone else's shift, or an archived one, simply does not
    /// come back, so the caller's count check rejects it the same way it
    /// rejects an id that never existed.
    /// </summary>
    public async Task<Shift[]> GetShiftsByIdsAsync(int userId, int[] ids, CancellationToken ct)
    {
        return await _db.Shifts
            .Include(s => s.Location)
            .Include(s => s.Breaks)
            .Where(s => s.UserId == userId && !s.Archived && ids.Contains(s.Id))
            .ToArrayAsync(ct);
    }

    public async Task<Shift[]> GetShiftsAsync(
        int userId,
        bool includeArchived,
        CancellationToken ct)
    {
        return await _db.Shifts
            .AsNoTracking()
            .Include(s => s.Location)
            .Include(s => s.Breaks)
            .Where(s => s.UserId == userId && (includeArchived || !s.Archived))
            .OrderBy(s => s.Archived)
            .ThenBy(s => s.Name)
            .ToArrayAsync(ct);
    }

    public async Task<Sales[]> GetSalesAsync(
        int userId,
        bool includeArchived,
        CancellationToken ct)
    {
        return await _db.Sales
            .AsNoTracking()
            .Where(s => s.UserId == userId && (includeArchived || !s.Archived))
            .OrderBy(s => s.Archived)
            .ThenBy(s => s.Name)
            .ToArrayAsync(ct);
    }

    // Tracked: the caller mutates and saves these.
    public async Task<Shift?> GetShiftAsync(int userId, int id, CancellationToken ct)
    {
        return await _db.Shifts
            .Include(s => s.Location)
            .Include(s => s.Breaks)
            .FirstOrDefaultAsync(s => s.UserId == userId && s.Id == id, ct);
    }

    public async Task<Sales?> GetSalesItemAsync(int userId, int id, CancellationToken ct)
    {
        return await _db.Sales
            .FirstOrDefaultAsync(s => s.UserId == userId && s.Id == id, ct);
    }

    public async Task<Sales[]> GetSalesByIdsAsync(int userId, int[] ids, CancellationToken ct)
    {
        return await _db.Sales
            .Where(s => s.UserId == userId && !s.Archived && ids.Contains(s.Id))
            .ToArrayAsync(ct);
    }

    /// <summary>
    /// A month of the calendar in one query. Shifts and sale entries are
    /// included because every cell needs them to render.
    /// </summary>
    public async Task<Day[]> GetDaysInRangeAsync(
        int userId,
        DateOnly from,
        DateOnly to,
        CancellationToken ct)
    {
        return await _db.Days
            .AsNoTracking()
            .Include(d => d.Shifts)!
                .ThenInclude(entry => entry.Shift)!
                .ThenInclude(shift => shift!.Location)
            .Include(d => d.Sales)!
                .ThenInclude(entry => entry.Sales)
            .Where(d => d.UserId == userId && d.Date >= from && d.Date <= to)
            .OrderBy(d => d.Date)
            .ToArrayAsync(ct);
    }

    public async Task<Location[]> GetLocationsAsync(
        int userId,
        bool includeArchived,
        CancellationToken ct)
    {
        return await _db.Locations
            .AsNoTracking()
            .Where(l => l.UserId == userId && (includeArchived || !l.Archived))
            .OrderBy(l => l.Archived)
            .ThenBy(l => l.Name)
            .ToArrayAsync(ct);
    }

    public async Task<Location?> GetLocationAsync(int userId, int id, CancellationToken ct)
    {
        return await _db.Locations
            .FirstOrDefaultAsync(l => l.UserId == userId && l.Id == id, ct);
    }

    /// <summary>
    /// Payments whose period ends inside the range. Attributing by the end date
    /// keeps the rule unambiguous: a payment lands in exactly one range rather
    /// than being split across two when its period straddles a boundary.
    /// </summary>
    public async Task<Payout[]> GetPayoutsAsync(
        int userId,
        DateOnly from,
        DateOnly to,
        CancellationToken ct)
    {
        return await _db.Payouts
            .Include(payout => payout.Location)
            .AsNoTracking()
            .Where(p => p.UserId == userId && p.PeriodTo >= from && p.PeriodTo <= to)
            .OrderByDescending(p => p.ReceivedOn)
            .ToArrayAsync(ct);
    }

    public async Task<Payout?> GetPayoutAsync(int userId, int id, CancellationToken ct)
    {
        return await _db.Payouts
            .Include(payout => payout.Location)
            .FirstOrDefaultAsync(p => p.UserId == userId && p.Id == id, ct);
    }
}
