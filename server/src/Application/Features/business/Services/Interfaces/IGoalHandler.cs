using Shifter.Application.Features.business.DTOs;

namespace Shifter.Application.Features.business.Services.Interfaces;

public interface IGoalHandler
{
    Task<GoalItemDto[]> ListAsync(int userId, CancellationToken ct);

    /// <summary>
    /// Writes the goal for a period and anchor, replacing whatever was there.
    /// An upsert rather than create-plus-update because there can only ever be
    /// one rule per period per anchor, and asking the client to know which verb
    /// applies is asking it to track state the server already holds.
    /// </summary>
    Task<GoalItemDto> SaveAsync(GoalSaveDto request, int userId, CancellationToken ct);

    Task DeleteAsync(int userId, int id, CancellationToken ct);
}
