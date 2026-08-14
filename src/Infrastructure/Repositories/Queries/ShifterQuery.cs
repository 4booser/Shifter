using Microsoft.EntityFrameworkCore;
using Shifter.Domain.Entities;
using Shifter.Infrastructure.Persistence.DbContexts;
using Shifter.Infrastructure.Repositories.Interfaces;

namespace Shifter.Infrastructure.Repositories.Queries;

public class ShifterQuery : IShifterQuery
{
    private readonly ShifterDbContext _db;
    public ShifterQuery(ShifterDbContext db) => _db = db;
    
    public async Task<Day[]> GetDaysByUserIdAsync(int userId, CancellationToken ct)
    {
        return await _db.Days
            .Where(d => d.UserId == userId)
            .ToArrayAsync(ct);
    }

    public async Task<Day?> GetDayByIdAsync(int id, CancellationToken ct)
    {
        return await _db.Days.FindAsync(id, ct);
    }

    public async Task<Shift?> GetShiftByIdAsync(int id, CancellationToken ct)
    {
        return await _db.Shifts.FirstOrDefaultAsync(s => s.Id == id, ct);
    }
}