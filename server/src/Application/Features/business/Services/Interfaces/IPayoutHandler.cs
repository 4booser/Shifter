using Shifter.Application.Features.business.DTOs;

namespace Shifter.Application.Features.business.Services.Interfaces;

public interface IPayoutHandler
{
    Task<PayoutDto[]> ListAsync(int userId, DateOnly from, DateOnly to, CancellationToken ct);
    Task<PayoutDto> CreateAsync(PayoutCreateDto request, int userId, CancellationToken ct);
    Task<PayoutDto> UpdateAsync(PayoutCreateDto request, int userId, int id, CancellationToken ct);
    Task DeleteAsync(int userId, int id, CancellationToken ct);

    /// <summary>Every payment and every period settlement, gone at once — the clean slate.</summary>
    Task<int> WipeAsync(int userId, CancellationToken ct);
}
