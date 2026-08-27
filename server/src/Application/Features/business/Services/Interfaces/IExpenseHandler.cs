using Shifter.Application.Features.business.DTOs;

namespace Shifter.Application.Features.business.Services.Interfaces;

public interface IExpenseHandler
{
    Task<ExpenseDto[]> ListAsync(int userId, DateOnly from, DateOnly to, CancellationToken ct);
    Task<ExpenseDto> CreateAsync(ExpenseCreateDto request, int userId, CancellationToken ct);
    Task DeleteAsync(int userId, int id, CancellationToken ct);
}
