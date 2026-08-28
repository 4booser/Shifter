using Shifter.Application.Features.business.DTOs;

namespace Shifter.Application.Features.business.Services.Interfaces;

public interface IExpenseHandler
{
    Task<ExpenseDto[]> ListAsync(int userId, DateOnly from, DateOnly to, CancellationToken ct);
    Task<ExpenseDto> CreateAsync(ExpenseCreateDto request, int userId, CancellationToken ct);
    Task DeleteAsync(int userId, int id, CancellationToken ct);

    Task<ExpenseRuleDto[]> RulesAsync(int userId, DateOnly today, CancellationToken ct);
    Task<ExpenseRuleDto> CreateRuleAsync(
        ExpenseRuleSaveDto request, int userId, DateOnly today, CancellationToken ct);
    Task<ExpenseRuleDto> UpdateRuleAsync(
        ExpenseRuleSaveDto request, int userId, int id, DateOnly today, CancellationToken ct);
    /// <summary>Calls off one occurrence, or puts it back.</summary>
    Task<ExpenseRuleDto> SkipAsync(
        int userId, int id, DateOnly day, bool skipped, DateOnly today, CancellationToken ct);
    Task DeleteRuleAsync(int userId, int id, CancellationToken ct);
}
