using Shifter.Application.Features.business.DTOs;

namespace Shifter.Application.Features.business.Services.Interfaces;

public interface IEventHandler
{
    Task<EventDto[]> ListAsync(int userId, DateOnly from, DateOnly to, CancellationToken ct);

    Task<EventDto> CreateAsync(EventSaveDto request, int userId, CancellationToken ct);

    Task<EventDto> UpdateAsync(EventSaveDto request, int userId, int id, CancellationToken ct);

    Task DeleteAsync(int userId, int id, CancellationToken ct);
}
