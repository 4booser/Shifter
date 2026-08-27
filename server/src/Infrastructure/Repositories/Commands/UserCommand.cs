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
        // Three tables name a person by id without a foreign key, so nothing
        // cascades them: a deleted account would leave a Telegram chat still
        // bound to it, reviews naming it, and swap offers waiting on somebody
        // who no longer exists. Cleared explicitly, before the row they point
        // at goes.
        await _db.TelegramLinks
            .Where(link => link.UserId == user.Id)
            .ExecuteDeleteAsync(ct);

        await _db.GigReviews
            .Where(review => review.AuthorUserId == user.Id || review.TargetUserId == user.Id)
            .ExecuteDeleteAsync(ct);

        await _db.ShiftSwaps
            .Where(swap => swap.ProposerUserId == user.Id || swap.TargetUserId == user.Id)
            .ExecuteDeleteAsync(ct);

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