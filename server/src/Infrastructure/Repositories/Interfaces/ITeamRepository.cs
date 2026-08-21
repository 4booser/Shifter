using Shifter.Domain.Entities;

namespace Shifter.Infrastructure.Repositories.Interfaces;

public interface ITeamRepository
{
    Task<Team[]> GetForUserAsync(int userId, CancellationToken ct);

    /// <summary>Null when the team does not exist or the caller is not in it.</summary>
    Task<Team?> GetForMemberAsync(int teamId, int userId, CancellationToken ct);

    Task<Team?> GetByCodeAsync(string code, CancellationToken ct);

    Task<bool> CodeExistsAsync(string code, CancellationToken ct);

    Task AddAsync(Team team, CancellationToken ct);
    Task AddMemberAsync(TeamMember member, CancellationToken ct);
    Task RemoveMemberAsync(TeamMember member, CancellationToken ct);
    Task RemoveTeamAsync(Team team, CancellationToken ct);
    Task SaveAsync(CancellationToken ct);

    /// <summary>
    /// The rota rows for a set of people over a range. Returns the shift facts
    /// only — the query never reads a pay column, so no amount can leak by
    /// someone later widening a DTO.
    /// </summary>
    Task<RotaRow[]> GetRotaAsync(
        int[] userIds,
        DateOnly from,
        DateOnly to,
        CancellationToken ct);

    /// <summary>
    /// The placement someone is offering to take, with the facts an offer has
    /// to copy. Returns null when it does not exist — including when it belongs
    /// to nobody in the given set, so a stranger's shift can never be reached.
    /// </summary>
    Task<CoverShift?> GetCoverShiftAsync(int dayShiftId, int[] userIds, CancellationToken ct);

    Task<CoverOffer[]> GetOffersAsync(int teamId, DateOnly from, DateOnly to, CancellationToken ct);

    Task<CoverOffer[]> GetOffersForShiftAsync(int dayShiftId, CancellationToken ct);

    Task<CoverOffer?> GetOfferAsync(int offerId, int teamId, CancellationToken ct);

    Task AddOfferAsync(CoverOffer offer, CancellationToken ct);
    Task RemoveOfferAsync(CoverOffer offer, CancellationToken ct);

    /// <summary>
    /// Hands the shift over: the owner stops working it, and every offer on it
    /// is settled in the same save so a second acceptance cannot follow.
    /// </summary>
    Task AcceptOfferAsync(CoverOffer accepted, CancellationToken ct);
}

/// <summary>
/// What accepting an offer is allowed to know about the placement. Same rule as
/// RotaRow: no pay column is read, so none can leak through a widened DTO.
/// </summary>
public sealed record CoverShift(
    int DayShiftId,
    int OwnerUserId,
    DateOnly Date,
    string ShiftName,
    TimeOnly StartTime,
    TimeOnly EndTime,
    bool NeedsCover,
    bool Worked);

/// <summary>What the rota query is allowed to know about someone's day.</summary>
public sealed record RotaRow(
    /// <summary>Identifies the placement, so an offer can name which one.</summary>
    int DayShiftId,
    int UserId,
    DateOnly Date,
    string ShiftName,
    string? Symbol,
    string? Colour,
    TimeOnly StartTime,
    TimeOnly EndTime,
    int BreakMinutes,
    bool Worked,
    bool NeedsCover);
