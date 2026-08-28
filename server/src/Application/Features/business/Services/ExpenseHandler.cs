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

    /// <summary>
    /// What the work cost in this range: the rows somebody wrote, plus the
    /// ones their standing costs say are due.
    ///
    /// The conjured ones are marked. An estimate never mixes with a fact, and
    /// "the pass will cost 900 on the 5th" is an estimate right up until the
    /// 5th — but leaving it out entirely would mean the app knows something
    /// about somebody's month and declines to say it.
    /// </summary>
    public async Task<ExpenseDto[]> ListAsync(
        int userId, DateOnly from, DateOnly to, CancellationToken ct)
    {
        var written = await _query.GetExpensesAsync(userId, from, to, ct);
        var rules = await _query.GetExpenseRulesAsync(userId, ct);

        // A day already carrying a real expense from this rule is a day the
        // person has dealt with; predicting it again would count it twice.
        var settled = written
            .Where(expense => expense.RuleId is not null)
            .Select(expense => (expense.RuleId!.Value, expense.Date))
            .ToHashSet();

        var rows = written.Select(ToDto).ToList();

        foreach (var rule in rules)
        {
            foreach (var day in ExpenseRecurrence.Occurrences(rule, from, to))
            {
                if (settled.Contains((rule.Id, day))) continue;

                rows.Add(new ExpenseDto(
                    // Not a database id: nothing to delete, because nothing
                    // was written. Negative so it cannot collide with one.
                    -(rule.Id * 100_000 + day.DayNumber % 100_000),
                    day,
                    rule.Amount,
                    rule.Kind,
                    rule.Note,
                    rule.LocationId,
                    rule.Location?.Name,
                    expected: true,
                    rule_id: rule.Id));
            }
        }

        return rows.OrderByDescending(row => row.date).ToArray();
    }

    public async Task<ExpenseRuleDto[]> RulesAsync(int userId, DateOnly today, CancellationToken ct)
        => (await _query.GetExpenseRulesAsync(userId, ct))
            .Select(rule => ToDto(rule, today))
            .ToArray();

    public async Task<ExpenseRuleDto> CreateRuleAsync(
        ExpenseRuleSaveDto request, int userId, DateOnly today, CancellationToken ct)
    {
        var rule = new ExpenseRule { UserId = userId, Note = string.Empty };

        await ApplyAsync(request, rule, userId, ct);

        if (!await _command.AddExpenseRuleAsync(rule, ct))
            throw new ForbiddenException("Can`t add the rule.");

        return ToDto(
            await _query.GetExpenseRuleAsync(userId, rule.Id, ct) ?? rule,
            today);
    }

    public async Task<ExpenseRuleDto> UpdateRuleAsync(
        ExpenseRuleSaveDto request, int userId, int id, DateOnly today, CancellationToken ct)
    {
        var rule = await _query.GetExpenseRuleAsync(userId, id, ct)
            ?? throw new NotFoundException("That standing cost does not exist.");

        await ApplyAsync(request, rule, userId, ct);
        await _command.SaveAsync(ct);

        return ToDto(rule, today);
    }

    /// <summary>
    /// Calls off one occurrence, or puts it back.
    ///
    /// Not an edit to the rule: the pass is still bought every month, it was
    /// simply not bought in August because August was holiday. Deleting the
    /// rule would lose that distinction and next month with it.
    /// </summary>
    public async Task<ExpenseRuleDto> SkipAsync(
        int userId, int id, DateOnly day, bool skipped, DateOnly today, CancellationToken ct)
    {
        var rule = await _query.GetExpenseRuleAsync(userId, id, ct)
            ?? throw new NotFoundException("That standing cost does not exist.");

        var days = ExpenseRecurrence.ParseDays(rule.SkippedDays);

        if (skipped) days.Add(day);
        else days.Remove(day);

        rule.SkippedDays = ExpenseRecurrence.JoinDays(days);

        await _command.SaveAsync(ct);

        return ToDto(rule, today);
    }

    public async Task DeleteRuleAsync(int userId, int id, CancellationToken ct)
    {
        var rule = await _query.GetExpenseRuleAsync(userId, id, ct)
            ?? throw new NotFoundException("That standing cost does not exist.");

        await _command.DeleteExpenseRuleAsync(rule, ct);
    }

    private async Task ApplyAsync(
        ExpenseRuleSaveDto request, ExpenseRule rule, int userId, CancellationToken ct)
    {
        if (request.amount <= 0m)
            throw new ValidationException("A standing cost has to be more than nothing.");

        var note = request.note?.Trim() ?? string.Empty;

        if (note.Length == 0)
            throw new ValidationException("Say what it is, or the list is a column of numbers.");

        if (note.Length > ExpenseRule.NoteMax)
            throw new ValidationException($"Note must be at most {ExpenseRule.NoteMax} characters.");

        var period = request.period?.Trim().ToLowerInvariant() switch
        {
            null or "" or "month" => "month",
            "week" => "week",
            _ => throw new ValidationException("A standing cost repeats by week or by month."),
        };

        // 1..28, the same as a payday: the 31st would skip February, and a
        // rule that quietly skips a month is worse than one that asks for a
        // day every month has.
        if (period == "month" && request.day_of_month is < 1 or > 28)
            throw new ValidationException("The day of the month must be between 1 and 28.");

        if (period == "week" && request.weekday is < 0 or > 6)
            throw new ValidationException("The weekday must be between 0 and 6.");

        if (request.ends_on is DateOnly ends && ends < request.starts_on)
            throw new ValidationException("It cannot end before it starts.");

        if (request.location_id is int placeId)
        {
            _ = await _query.GetLocationAsync(userId, placeId, ct)
                ?? throw new NotFoundException("Place of work does not exist.");
        }

        rule.Amount = request.amount;
        rule.Kind = ExpenseRules.ParseKind(request.kind);
        rule.Note = note;
        rule.Period = period;
        rule.DayOfMonth = period == "month" ? request.day_of_month : rule.DayOfMonth;
        rule.Weekday = period == "week" ? request.weekday : rule.Weekday;
        rule.StartsOn = request.starts_on;
        rule.EndsOn = request.ends_on;
        rule.LocationId = request.location_id;
    }

    private static ExpenseRuleDto ToDto(ExpenseRule rule, DateOnly today)
    {
        // A year ahead is far enough to find the next one on any rhythm, and
        // near enough that "next" still means something.
        var next = ExpenseRecurrence
            .Occurrences(rule, today, today.AddYears(1))
            .Cast<DateOnly?>()
            .FirstOrDefault();

        return new ExpenseRuleDto(
            rule.Id,
            rule.Amount,
            rule.Kind,
            rule.Note,
            rule.Period,
            rule.DayOfMonth,
            rule.Weekday,
            rule.StartsOn,
            rule.EndsOn,
            rule.LocationId,
            rule.Location?.Name,
            [.. ExpenseRecurrence.ParseDays(rule.SkippedDays).OrderBy(day => day)],
            next,
            // What it comes to in a month, whatever its rhythm — the figure
            // that lets two costs on different cycles be compared at all.
            rule.Period == "week"
                ? Math.Round(rule.Amount * 52m / 12m, 2)
                : rule.Amount);
    }

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
