using Microsoft.EntityFrameworkCore;
using Shifter.Domain.Entities;
using Shifter.Infrastructure.Persistence.DbContexts;
using Shifter.Infrastructure.Repositories.Interfaces;

namespace Shifter.Infrastructure.Repositories.Queries;

public class TeamRepository : ITeamRepository
{
    private readonly ShifterDbContext _db;

    public TeamRepository(ShifterDbContext db)
        => _db = db;

    public async Task<Team[]> GetForUserAsync(int userId, CancellationToken ct)
    {
        return await _db.Teams
            .AsNoTracking()
            .Include(team => team.Members)
            .Where(team => team.Members!.Any(member => member.UserId == userId))
            .OrderBy(team => team.Name)
            .ToArrayAsync(ct);
    }

    public async Task<Team?> GetForMemberAsync(int teamId, int userId, CancellationToken ct)
    {
        // Membership is part of the lookup rather than a check afterwards, so
        // there is no path that returns a team to someone outside it.
        return await _db.Teams
            .Include(team => team.Members)
            .FirstOrDefaultAsync(
                team => team.Id == teamId && team.Members!.Any(m => m.UserId == userId),
                ct);
    }

    public async Task<Team?> GetByCodeAsync(string code, CancellationToken ct)
    {
        return await _db.Teams
            .Include(team => team.Members)
            .FirstOrDefaultAsync(team => team.InviteCode == code, ct);
    }

    public async Task<bool> CodeExistsAsync(string code, CancellationToken ct)
        => await _db.Teams.AnyAsync(team => team.InviteCode == code, ct);

    public async Task AddAsync(Team team, CancellationToken ct)
    {
        await _db.Teams.AddAsync(team, ct);
        await _db.SaveChangesAsync(ct);
    }

    public async Task AddMemberAsync(TeamMember member, CancellationToken ct)
    {
        await _db.TeamMembers.AddAsync(member, ct);
        await _db.SaveChangesAsync(ct);
    }

    public async Task RemoveMemberAsync(TeamMember member, CancellationToken ct)
    {
        _db.TeamMembers.Remove(member);
        await _db.SaveChangesAsync(ct);
    }

    public async Task RemoveTeamAsync(Team team, CancellationToken ct)
    {
        _db.Teams.Remove(team);
        await _db.SaveChangesAsync(ct);
    }

    public async Task SaveAsync(CancellationToken ct)
        => await _db.SaveChangesAsync(ct);

    public async Task<RotaRow[]> GetRotaAsync(
        int[] userIds,
        DateOnly from,
        DateOnly to,
        CancellationToken ct)
    {
        // Projected in the database to exactly the columns a rota may show.
        // Pay, tips, sales and rates are never read, so they cannot escape by
        // accident later on.
        return await _db.DayShifts
            .AsNoTracking()
            .Where(entry =>
                entry.Day != null
                && userIds.Contains(entry.Day.UserId)
                && entry.Day.Date >= from
                && entry.Day.Date <= to)
            .Select(entry => new RotaRow(
                entry.Day!.UserId,
                entry.Day.Date,
                entry.Shift!.Name,
                entry.Shift.Symbol,
                entry.Shift.Location!.Colour,
                entry.StartTime,
                entry.EndTime,
                entry.BreakMinutes,
                entry.Worked,
                entry.NeedsCover))
            .ToArrayAsync(ct);
    }
}
