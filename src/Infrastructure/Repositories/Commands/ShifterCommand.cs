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
}