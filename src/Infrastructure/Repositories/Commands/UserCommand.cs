using Microsoft.EntityFrameworkCore;
using Shifter.Domain.Entities;
using Shifter.Infrastructure.Persistence.DbContexts;
using Shifter.Infrastructure.Repositories.Interfaces;

namespace Shifter.Infrastructure.Repositories.Commands;

public class UserCommand : IUserCommand
{
    private readonly ShifterDbContext _db;
    
    public UserCommand(ShifterDbContext db)
        => _db = db;

    public async Task<bool> AddAsync(User user, CancellationToken ct)
    {
        await _db.Users.AddAsync(user, ct);
        return await _db.SaveChangesAsync(ct) > 0;
    }

    public async Task DeleteAsync(User user, CancellationToken ct)
    {
        _db.Users.Remove(user);
        await _db.SaveChangesAsync(ct);
    }

    public async Task SaveAsync(CancellationToken ct)
        => await _db.SaveChangesAsync(ct);

    public async Task SetMonthlyGoalAsync(int userId, decimal? goal, CancellationToken ct)
    {
        await _db.Users
            .Where(user => user.Id == userId)
            .ExecuteUpdateAsync(set => set.SetProperty(user => user.MonthlyGoal, goal), ct);
    }
}