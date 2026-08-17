using Shifter.Application.Features.business.DTOs;

namespace Shifter.Application.Features.business.Services.Interfaces;

/// <remarks>
/// userId is always a parameter, never a field on the request: taking it from
/// the payload would let a caller act on another user's data.
/// </remarks>
public interface IShiftHandler
{
    Task<ShiftDto[]> ListAsync(int userId, bool includeArchived, CancellationToken ct);
    Task<ShiftDto> CreateAsync(ShiftCreateDto request, int userId, CancellationToken ct);
    Task<ShiftDto> UpdateAsync(ShiftCreateDto request, int userId, int id, CancellationToken ct);
    Task<ShiftDto> SetArchivedAsync(int userId, int id, bool archived, CancellationToken ct);
}
