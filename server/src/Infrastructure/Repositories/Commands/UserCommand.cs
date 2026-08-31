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
        // A team outlives its owner. Deleting the crew's whole rota because one
        // person closed their account would be the wrong answer, and leaving
        // the team pointing at a user who no longer exists was worse: the
        // invite code could never be rotated and the team could never be
        // deleted, so anybody who had ever seen the six-character code was in
        // for good. Ownership moves to the longest-standing manager, or failing
        // that the longest-standing member; a team with nobody left goes.
        await HandOverTeamsAsync(user.Id, ct);

        // These tables name a person by id without a foreign key, so nothing
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

    /// <summary>
    /// Passes on every team this person owns, or removes the ones nobody is
    /// left to run.
    /// </summary>
    private async Task HandOverTeamsAsync(int userId, CancellationToken ct)
    {
        Team[] owned = await _db.Teams
            .Include(team => team.Members)
            .Where(team => team.OwnerUserId == userId)
            .ToArrayAsync(ct);

        foreach (Team team in owned)
        {
            TeamMember? heir = (team.Members ?? [])
                .Where(member => member.UserId != userId)
                // A manager first: they are already trusted with the rota.
                // Then whoever has been there longest, because the crew knows
                // them — and it is the one ordering nobody has to be told.
                .OrderByDescending(member => member.IsManager)
                .ThenBy(member => member.Id)
                .FirstOrDefault();

            if (heir is null)
            {
                _db.Teams.Remove(team);
                continue;
            }

            team.OwnerUserId = heir.UserId;
            heir.IsManager = true;
        }

        // The member row of the person leaving goes with them either way.
        await _db.TeamMembers
            .Where(member => member.UserId == userId)
            .ExecuteDeleteAsync(ct);
    }

    public async Task SaveAsync(CancellationToken ct)
        => await _db.SaveChangesAsync(ct);

    public async Task SetMonthlyGoalAsync(int userId, decimal? goal, CancellationToken ct)
    {
        await _db.Users
            .Where(user => user.Id == userId)
            .ExecuteUpdateAsync(set => set.SetProperty(user => user.MonthlyGoal, goal), ct);
    }

    public async Task SetRestHoursAsync(int userId, double hours, CancellationToken ct)
    {
        await _db.Users
            .Where(user => user.Id == userId)
            .ExecuteUpdateAsync(set => set.SetProperty(user => user.RestHours, hours), ct);
    }

    public async Task SetColourPresetsAsync(int userId, string presets, CancellationToken ct)
    {
        await _db.Users
            .Where(user => user.Id == userId)
            .ExecuteUpdateAsync(set => set.SetProperty(user => user.ColourPresets, presets), ct);
    }

    public async Task SetTipJarAsync(int userId, decimal percent, decimal goal, CancellationToken ct)
    {
        var user = await _db.Users.FirstOrDefaultAsync(row => row.Id == userId, ct);

        if (user is null) return;

        // The day is stamped when the rule first starts and left alone after.
        // Changing the share should not restart the count and lose what has
        // been put aside so far; turning it off and on again should.
        if (percent > 0 && user.TipSavePercent <= 0) user.TipSaveFrom = DateOnly.FromDateTime(DateTime.UtcNow);
        if (percent <= 0) user.TipSaveFrom = null;

        user.TipSavePercent = percent;
        user.TipSaveGoal = goal;

        await _db.SaveChangesAsync(ct);
    }
}