using Shifter.Application.Features.business.DTOs;

namespace Shifter.Application.Features.business.Services.Interfaces;

public interface IEventTemplateHandler
{
    Task<EventTemplateDto[]> ListAsync(int userId, bool includeArchived, CancellationToken ct);

    Task<EventTemplateDto> CreateAsync(EventTemplateSaveDto request, int userId, CancellationToken ct);

    Task<EventTemplateDto> UpdateAsync(EventTemplateSaveDto request, int userId, int id, CancellationToken ct);

    Task ArchiveAsync(int userId, int id, bool archived, CancellationToken ct);

    Task DeleteAsync(int userId, int id, CancellationToken ct);
}
