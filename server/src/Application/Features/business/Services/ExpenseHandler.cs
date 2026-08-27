using Shifter.Application.Common.Exceptions;
using Shifter.Application.Features.business.DTOs;
using Shifter.Domain.Entities;
using Shifter.Application.Features.business.Services.Interfaces;
using Shifter.Infrastructure.Repositories.Interfaces;

namespace Shifter.Application.Features.business.Services;

/// <summary>
/// Recording what the work cost. Mirrors the payout handler on purpose — the
/// two are the same shape of fact from opposite directions, and a person who
/// has learned one screen should not have to learn the other.
/// </summary>
public class ExpenseHandler : IExpenseHandler
{
    private readonly IShifterCommand _command;
    private readonly IShifterQuery _query;

    public ExpenseHandler(IShifterCommand command, IShifterQuery query)
    {
        _command = command;
        _query = query;
    }

    public async Task<ExpenseDto[]> ListAsync(
        int userId, DateOnly from, DateOnly to, CancellationToken ct)
        => (await _query.GetExpensesAsync(userId, from, to, ct)).Select(ToDto).ToArray();

    public async Task<ExpenseDto> CreateAsync(
        ExpenseCreateDto request, int userId, CancellationToken ct)
    {
        if (request.amount <= 0m)
            throw new ValidationException("An expense has to be more than nothing.");

        if (request.note?.Length > WorkExpense.NoteMax)
            throw new ValidationException($"Note must be at most {WorkExpense.NoteMax} characters.");

        // A place that is not the caller's must not end up on their expense:
        // the per-place figures would then describe work they never did.
        if (request.location_id is int placeId)
        {
            _ = await _query.GetLocationAsync(userId, placeId, ct)
                ?? throw new NotFoundException("Place of work does not exist.");
        }

        WorkExpense expense = new WorkExpense
        {
            UserId = userId,
            LocationId = request.location_id,
            Date = request.date,
            Amount = request.amount,
            Kind = ExpenseRules.ParseKind(request.kind),
            Note = string.IsNullOrWhiteSpace(request.note) ? null : request.note.Trim(),
        };

        if (!await _command.AddExpenseAsync(expense, ct))
            throw new ForbiddenException("Can`t add expense.");

        // Re-read so the response carries the place's name.
        return ToDto(await _query.GetExpenseAsync(userId, expense.Id, ct) ?? expense);
    }

    public async Task DeleteAsync(int userId, int id, CancellationToken ct)
    {
        WorkExpense expense = await _query.GetExpenseAsync(userId, id, ct)
            ?? throw new NotFoundException("Expense does not exist.");

        await _command.DeleteExpenseAsync(expense, ct);
    }

    private static ExpenseDto ToDto(WorkExpense expense) => new ExpenseDto(
        expense.Id,
        expense.Date,
        expense.Amount,
        expense.Kind,
        expense.Note,
        expense.LocationId,
        expense.Location?.Name);
}
