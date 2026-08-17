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
}

/// <summary>What the rota query is allowed to know about someone's day.</summary>
public sealed record RotaRow(
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
