using Shifter.Domain.Entities;
using Shifter.Infrastructure.Repositories.Interfaces;

namespace Shifter.Tests;

/// <summary>
/// In-memory stand-in for the team repository, in the same spirit as the ones
/// in Fakes.cs: the handlers only ask it for lists and rows, so a plain object
/// reads better than a chain of setup calls.
///
/// The membership rule is reproduced rather than stubbed, because it is the
/// boundary the cover handlers rely on for their access control — a fake that
/// handed back a team to anyone who asked would make those tests meaningless.
/// </summary>
public sealed class FakeTeamRepository : ITeamRepository
{
    public List<Team> Teams { get; } = [];
    public List<CoverOffer> Offers { get; } = [];
    public List<CoverShift> Shifts { get; } = [];

    /// <summary>Placements the handler asked to delete on a handover.</summary>
    public List<int> DeletedShifts { get; } = [];

    private int _nextOfferId = 1;

    public Task<Team?> GetForMemberAsync(int teamId, int userId, CancellationToken ct)
        => Task.FromResult(Teams.FirstOrDefault(team =>
            team.Id == teamId && (team.Members ?? []).Any(m => m.UserId == userId)));

    public Task<CoverShift?> GetCoverShiftAsync(int dayShiftId, int[] userIds, CancellationToken ct)
        => Task.FromResult(Shifts.FirstOrDefault(shift =>
            shift.DayShiftId == dayShiftId && userIds.Contains(shift.OwnerUserId)));

    public Task<CoverOffer[]> GetOffersAsync(
        int teamId,
        DateOnly from,
        DateOnly to,
        CancellationToken ct)
        => Task.FromResult(Offers
            .Where(offer => offer.TeamId == teamId && offer.Date >= from && offer.Date <= to)
            .ToArray());

    public Task<CoverOffer[]> GetOffersForShiftAsync(int dayShiftId, CancellationToken ct)
        => Task.FromResult(Offers.Where(offer => offer.DayShiftId == dayShiftId).ToArray());

    public Task<CoverOffer?> GetOfferAsync(int offerId, int teamId, CancellationToken ct)
        => Task.FromResult(Offers.FirstOrDefault(offer =>
            offer.Id == offerId && offer.TeamId == teamId));

    public Task AddOfferAsync(CoverOffer offer, CancellationToken ct)
    {
        offer.Id = _nextOfferId++;
        Offers.Add(offer);

        return Task.CompletedTask;
    }

    public Task RemoveOfferAsync(CoverOffer offer, CancellationToken ct)
    {
        Offers.Remove(offer);

        return Task.CompletedTask;
    }

    public Task AcceptOfferAsync(CoverOffer accepted, CancellationToken ct)
    {
        int? dayShiftId = accepted.DayShiftId;

        accepted.AcceptedAt = DateTime.UtcNow;
        accepted.DayShiftId = null;

        if (dayShiftId is int id)
        {
            Offers.RemoveAll(offer => offer.DayShiftId == id && offer.Id != accepted.Id);
            DeletedShifts.Add(id);
        }

        return Task.CompletedTask;
    }

    // ==== Not exercised by these tests ====

    public Task<Team[]> GetForUserAsync(int userId, CancellationToken ct)
        => Task.FromResult(Teams.Where(team =>
            (team.Members ?? []).Any(m => m.UserId == userId)).ToArray());

    public Task<Team?> GetByCodeAsync(string code, CancellationToken ct)
        => Task.FromResult(Teams.FirstOrDefault(team => team.InviteCode == code));

    public Task<bool> CodeExistsAsync(string code, CancellationToken ct)
        => Task.FromResult(Teams.Any(team => team.InviteCode == code));

    public Task AddAsync(Team team, CancellationToken ct)
    {
        Teams.Add(team);

        return Task.CompletedTask;
    }

    public Task AddMemberAsync(TeamMember member, CancellationToken ct) => Task.CompletedTask;

    public Task RemoveMemberAsync(TeamMember member, CancellationToken ct) => Task.CompletedTask;

    public Task RemoveTeamAsync(Team team, CancellationToken ct)
    {
        Teams.Remove(team);

        return Task.CompletedTask;
    }

    public Task SaveAsync(CancellationToken ct) => Task.CompletedTask;

    /// <summary>
    /// Placements the caller owns, for the visibility handler to edit.
    /// Keyed the way the real lookup is — by shift and owner together — so a
    /// fake cannot hand back somebody else's shift and make the ownership
    /// check untestable.
    /// </summary>
    public List<DayShift> OwnedShifts { get; } = [];

    /// <summary>Who the last rota query was told shares their earnings.</summary>
    public int[] LastSharingUserIds { get; private set; } = [];

    /// <summary>Who the last rota query was told hides by default.</summary>
    public int[] LastPrivateUserIds { get; private set; } = [];

    public Task<RotaRow[]> GetRotaAsync(
        int[] userIds,
        int callerUserId,
        int[] sharingUserIds,
        int[] privateByDefaultUserIds,
        DateOnly from,
        DateOnly to,
        CancellationToken ct)
    {
        // Recorded rather than acted on: the filtering itself is SQL and is
        // verified against a real database, but which people the handler
        // classifies as sharing is a decision made in the handler, and that is
        // worth pinning here.
        LastSharingUserIds = sharingUserIds;
        LastPrivateUserIds = privateByDefaultUserIds;

        return Task.FromResult(Array.Empty<RotaRow>());
    }

    public Task<DayShift?> GetOwnShiftAsync(int dayShiftId, int userId, CancellationToken ct)
        => Task.FromResult(OwnedShifts.FirstOrDefault(shift =>
            shift.Id == dayShiftId && shift.Day?.UserId == userId));
}
