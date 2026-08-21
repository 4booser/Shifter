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
                entry.Id,
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

    public async Task<CoverShift?> GetCoverShiftAsync(
        int dayShiftId,
        int[] userIds,
        CancellationToken ct)
    {
        // The owner set is part of the query rather than a check afterwards:
        // a placement belonging to somebody outside the team is simply not
        // found, and nothing about it is read on the way to saying so.
        return await _db.DayShifts
            .AsNoTracking()
            .Where(entry =>
                entry.Id == dayShiftId
                && entry.Day != null
                && userIds.Contains(entry.Day.UserId))
            .Select(entry => new CoverShift(
                entry.Id,
                entry.Day!.UserId,
                entry.Day.Date,
                entry.Shift!.Name,
                entry.StartTime,
                entry.EndTime,
                entry.NeedsCover,
                entry.Worked))
            .FirstOrDefaultAsync(ct);
    }

    public async Task<CoverOffer[]> GetOffersAsync(
        int teamId,
        DateOnly from,
        DateOnly to,
        CancellationToken ct)
    {
        return await _db.CoverOffers
            .AsNoTracking()
            .Where(offer => offer.TeamId == teamId && offer.Date >= from && offer.Date <= to)
            .OrderBy(offer => offer.CreatedAt)
            .ToArrayAsync(ct);
    }

    public async Task<CoverOffer[]> GetOffersForShiftAsync(int dayShiftId, CancellationToken ct)
    {
        return await _db.CoverOffers
            .Where(offer => offer.DayShiftId == dayShiftId)
            .ToArrayAsync(ct);
    }

    public async Task<CoverOffer?> GetOfferAsync(int offerId, int teamId, CancellationToken ct)
    {
        return await _db.CoverOffers
            .FirstOrDefaultAsync(offer => offer.Id == offerId && offer.TeamId == teamId, ct);
    }

    public async Task AddOfferAsync(CoverOffer offer, CancellationToken ct)
    {
        await _db.CoverOffers.AddAsync(offer, ct);
        await _db.SaveChangesAsync(ct);
    }

    public async Task RemoveOfferAsync(CoverOffer offer, CancellationToken ct)
    {
        _db.CoverOffers.Remove(offer);
        await _db.SaveChangesAsync(ct);
    }

    public async Task AcceptOfferAsync(CoverOffer accepted, CancellationToken ct)
    {
        int? dayShiftId = accepted.DayShiftId;

        accepted.AcceptedAt = DateTime.UtcNow;
        accepted.DayShiftId = null;

        if (dayShiftId is int id)
        {
            // The other offers on the same shift are dropped rather than left
            // pending: the shift is gone, and an offer to take something that
            // no longer exists is only confusing.
            List<CoverOffer> others = await _db.CoverOffers
                .Where(offer => offer.DayShiftId == id && offer.Id != accepted.Id)
                .ToListAsync(ct);

            _db.CoverOffers.RemoveRange(others);

            await _db.DayShifts.Where(entry => entry.Id == id).ExecuteDeleteAsync(ct);
        }

        await _db.SaveChangesAsync(ct);
    }
}
