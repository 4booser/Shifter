using Shifter.Application.Features.business.DTOs;

namespace Shifter.Application.Features.business.Services.Interfaces;

public interface ILocationHandler
{
    Task<LocationDto[]> ListAsync(int userId, bool includeArchived, CancellationToken ct);
    Task<LocationDto> CreateAsync(LocationCreateDto request, int userId, CancellationToken ct);
    Task<LocationDto> UpdateAsync(LocationCreateDto request, int userId, int id, CancellationToken ct);
    Task<LocationDto> SetArchivedAsync(int userId, int id, bool archived, CancellationToken ct);

    /// <summary>Refuses when history points at it; archive is the way then.</summary>
    /// <summary>
    /// Refuses while shift templates still point at the place. With
    /// <paramref name="detach"/> it removes the place from those templates
    /// first, which is a deliberate choice the caller has to make rather than
    /// something that happens quietly.
    /// </summary>
    Task DeleteAsync(int userId, int id, bool detach, CancellationToken ct);
}
