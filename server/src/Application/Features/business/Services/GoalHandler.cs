using Shifter.Application.Common.Exceptions;
using Shifter.Application.Common.Time;
using Shifter.Application.Features.business.DTOs;
using Shifter.Application.Features.business.Services.Interfaces;
using Shifter.Domain.Entities;
using Shifter.Infrastructure.Repositories.Interfaces;

namespace Shifter.Application.Features.business.Services;

public sealed class GoalHandler : IGoalHandler
{
    private const int NoteMaxLength = 120;

    private readonly IShifterQuery _shifterQuery;
    private readonly IShifterCommand _shifterCommand;
    private readonly AppClock _clock;

    public GoalHandler(
        IShifterQuery shifterQuery,
        IShifterCommand shifterCommand,
        AppClock? clock = null)
    {
        _shifterQuery = shifterQuery;
        _shifterCommand = shifterCommand;
        _clock = clock ?? new AppClock();
    }

    public async Task<GoalItemDto[]> ListAsync(int userId, CancellationToken ct)
    {
        Goal[] goals = await _shifterQuery.GetGoalsAsync(userId, ct);

        DateOnly today = _clock.Today;

        return goals.Select(goal => ToDto(goal, today)).ToArray();
    }

    public async Task<GoalItemDto> SaveAsync(GoalSaveDto request, int userId, CancellationToken ct)
    {
        if (request.amount <= 0)
            throw new ValidationException("A goal has to be above zero.");

        if (request.note?.Length > NoteMaxLength)
            throw new ValidationException($"Note must be at most {NoteMaxLength} characters.");

        GoalPeriod period = ParsePeriod(request.period);

        // Stored as the first day of the period it names, so the same month
        // asked for twice — once as the 1st and once as the 24th — is one row
        // rather than two rules that disagree.
        DateOnly? anchor = request.anchor is DateOnly given
            ? GoalCalculator.PeriodFor(period, given).From
            : null;

        Goal? existing = await _shifterQuery.FindGoalAsync(userId, period, anchor, ct);
        string? note = string.IsNullOrWhiteSpace(request.note) ? null : request.note.Trim();

        if (existing is not null)
        {
            existing.Amount = request.amount;
            existing.Note = note;
            await _shifterCommand.UpdateGoalAsync(existing, ct);

            return ToDto(existing, _clock.Today);
        }

        Goal goal = new Goal
        {
            UserId = userId,
            Period = period,
            Amount = request.amount,
            Anchor = anchor,
            Note = note,
        };

        if (!await _shifterCommand.AddGoalAsync(goal, ct))
            throw new ForbiddenException("Can`t add goal.");

        return ToDto(goal, _clock.Today);
    }

    public async Task DeleteAsync(int userId, int id, CancellationToken ct)
    {
        Goal goal = await _shifterQuery.GetGoalAsync(userId, id, ct)
            ?? throw new NotFoundException("Goal does not exist.");

        await _shifterCommand.DeleteGoalAsync(goal, ct);
    }

    private static GoalItemDto ToDto(Goal goal, DateOnly today)
    {
        // The period containing today, so the client can say "this month" beside
        // a standing goal without working the boundaries out itself.
        var (from, to) = GoalCalculator.PeriodFor(
            goal.Period,
            goal.Anchor ?? today);

        return new GoalItemDto(
            goal.Id,
            PeriodName(goal.Period),
            goal.Amount,
            goal.Anchor,
            goal.Note,
            from,
            to);
    }

    internal static string PeriodName(GoalPeriod period) => period switch
    {
        GoalPeriod.Day => "day",
        GoalPeriod.Week => "week",
        GoalPeriod.Month => "month",
        _ => "year",
    };

    private static GoalPeriod ParsePeriod(string? value) => value?.ToLowerInvariant() switch
    {
        "day" => GoalPeriod.Day,
        "week" => GoalPeriod.Week,
        "month" => GoalPeriod.Month,
        "year" => GoalPeriod.Year,
        _ => throw new ValidationException("Period must be one of: day, week, month, year."),
    };
}
