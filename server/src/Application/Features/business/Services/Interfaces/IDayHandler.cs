using Shifter.Application.Features.business.DTOs;

namespace Shifter.Application.Features.business.Services.Interfaces;

public interface IDayHandler
{
    Task<DaysDto> ListAsync(int userId, DateOnly from, DateOnly to, CancellationToken ct);
    Task<DayDto> SaveAsync(DaySaveDto request, int userId, DateOnly date, CancellationToken ct);
    Task<DayDto[]> BulkAsync(BulkShiftDto request, int userId, CancellationToken ct);
}
