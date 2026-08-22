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
        int callerUserId,
        int[] sharingUserIds,
        int[] privateByDefaultUserIds,
        DateOnly from,
        DateOnly to,
        CancellationToken ct)
    {
        // Projected in the database to exactly the columns a rota may show.
        // Tips, sales and rates are never read, so they cannot escape by
        // accident later on. The rate is the one exception and it does not
        // leave this method: it is read only for people who share earnings, is
        // turned into a total below, and RotaRow has nowhere to put it.
        var rows = await _db.DayShifts
            .AsNoTracking()
            .Where(entry =>
                entry.Day != null
                && userIds.Contains(entry.Day.UserId)
                && entry.Day.Date >= from
                && entry.Day.Date <= to
                // Your own shifts always come back, hidden ones included: the
                // point of hiding one is knowing you have.
                && (entry.Day.UserId == callerUserId
                    || entry.TeamVisible == true
                    || (entry.TeamVisible == null
                        && !privateByDefaultUserIds.Contains(entry.Day.UserId))))
            .Select(entry => new
            {
                Row = new RotaRow(
                    entry.Id,
                    entry.Day!.UserId,
                    entry.Day.Date,
                    entry.Shift!.Name,
                    entry.Shift.Symbol,
                    // The template's own colour first, the place's as a
                    // fallback — the same order the calendar uses, so one shift
                    // is not two colours depending on which screen it is on.
                    entry.Shift.Colour ?? entry.Shift.Location!.Colour,
                    entry.StartTime,
                    entry.EndTime,
                    entry.BreakMinutes,
                    entry.Worked,
                    entry.NeedsCover,
                    entry.TeamVisible,
                    null),
                Period = sharingUserIds.Contains(entry.Day.UserId)
                    ? (SalaryPeriod?)entry.SalaryPeriod
                    : null,
                Amount = sharingUserIds.Contains(entry.Day.UserId)
                    ? entry.SalaryAmount
                    : null,
            })
            .ToArrayAsync(ct);

        return [.. rows.Select(row => row.Row with { Pay = PayFor(row.Row, row.Period, row.Amount) })];
    }

    /// <summary>
    /// The same arithmetic <see cref="DayShift.Pay"/> does, on the projected
    /// row. Weekly and monthly wages earn nothing per shift — they are paid once
    /// per period — so a rota cannot say what those days were worth and does not
    /// pretend to.
    /// </summary>
    private static decimal? PayFor(RotaRow row, SalaryPeriod? period, decimal? amount)
    {
        if (period is null) return null;

        TimeSpan span = row.EndTime - row.StartTime;

        if (span < TimeSpan.Zero) span += TimeSpan.FromDays(1);

        TimeSpan paid = span - TimeSpan.FromMinutes(row.BreakMinutes);

        if (paid < TimeSpan.Zero) paid = TimeSpan.Zero;

        return period switch
        {
            SalaryPeriod.Hour => (amount ?? 0m) * (decimal)paid.TotalHours,
            SalaryPeriod.Day => amount ?? 0m,
            _ => 0m,
        };
    }

    public async Task<DayShift?> GetOwnShiftAsync(int dayShiftId, int userId, CancellationToken ct)
    {
        // Ownership is in the lookup, not a check after it, so there is no path
        // that hands back somebody else's placement to be edited.
        return await _db.DayShifts
            .Where(entry => entry.Id == dayShiftId && entry.Day!.UserId == userId)
            .FirstOrDefaultAsync(ct);
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
