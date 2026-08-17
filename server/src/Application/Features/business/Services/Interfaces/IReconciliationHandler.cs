using Shifter.Application.Features.business.DTOs;

namespace Shifter.Application.Features.business.Services.Interfaces;

public interface IReconciliationHandler
{
    /// <summary>Pay periods touching the range, with what is owed and what came.</summary>
    Task<ReconciliationDto> BuildAsync(
        int userId,
        DateOnly from,
        DateOnly to,
        CancellationToken ct);
}
