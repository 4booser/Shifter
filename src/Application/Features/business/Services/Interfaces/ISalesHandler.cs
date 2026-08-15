using Shifter.Application.Features.business.DTOs;

namespace Shifter.Application.Features.business.Services.Interfaces;

public interface ISalesHandler
{
    Task<SalesDto[]> ListAsync(int userId, bool includeArchived, CancellationToken ct);
    Task<SalesDto> CreateAsync(SalesCreateDto request, int userId, CancellationToken ct);
    Task<SalesDto> UpdateAsync(SalesCreateDto request, int userId, int id, CancellationToken ct);
    Task<SalesDto> SetArchivedAsync(int userId, int id, bool archived, CancellationToken ct);
}
