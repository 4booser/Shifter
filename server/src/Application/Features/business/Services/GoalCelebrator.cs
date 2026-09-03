using Shifter.Application.Features.Push;
using Shifter.Domain.Entities;
using Shifter.Infrastructure.Repositories.Interfaces;
using Shifter.Application.Common.Text;

namespace Shifter.Application.Features.business.Services;

/// <summary>
/// Turns a crossed goal into one push. Runs after a day is saved — the only
/// moment earned money can change — and stamps the goal so each period is
/// cheered exactly once, restarts and retries included.
/// </summary>
public sealed class GoalCelebrator
{
    /// <summary>Year on purpose excluded: summing 365 days on every save is not worth it.</summary>
    private static readonly GoalPeriod[] Watched = [GoalPeriod.Day, GoalPeriod.Week, GoalPeriod.Month];

    private readonly IShifterQuery _query;
    private readonly IShifterCommand _command;
    private readonly IPushNotifier _push;

    public GoalCelebrator(IShifterQuery query, IShifterCommand command, IPushNotifier push)
    {
        _query = query;
        _command = command;
        _push = push;
    }

    /// <summary>The goals that could still earn a cheer around this date — pure, so testable.</summary>
    public static IEnumerable<(Goal Goal, DateOnly From, DateOnly To)> Candidates(
        IEnumerable<Goal> goals, DateOnly date)
    {
        var list = goals.ToArray();

        foreach (var period in Watched)
        {
            var goal = GoalCalculator.ResolveFor(list, period, date);

            if (goal is null) continue;

            var (from, to) = GoalCalculator.PeriodFor(period, date);

            if (goal.CelebratedOn == from) continue;

            yield return (goal, from, to);
        }
    }

    public static bool Crossed(Goal goal, decimal earned) => earned >= goal.Amount;

    /// <param name="earnedOver">
    /// Supplied by the caller because the caller (the day handler) is the one
    /// who knows how to price a stretch of days; taking it as a function keeps
    /// this class free of a circular dependency on it.
    /// </param>
    public async Task CheckAsync(
        int userId,
        DateOnly date,
        Func<DateOnly, DateOnly, Task<decimal>> earnedOver,
        CancellationToken ct)
    {
        var goals = await _query.GetGoalsAsync(userId, ct);

        foreach (var (goal, from, to) in Candidates(goals, date))
        {
            var earned = await earnedOver(from, to);

            if (!Crossed(goal, earned)) continue;

            // The list above is a no-tracking read; stamping it would satisfy
            // nobody but this stack frame. Re-read tracked, re-check the stamp
            // in case a parallel save beat us to the same cheer.
            var tracked = await _query.GetGoalAsync(userId, goal.Id, ct);

            if (tracked is null || tracked.CelebratedOn == from) continue;

            tracked.CelebratedOn = from;
            await _command.UpdateGoalAsync(tracked, ct);

            // The trophy row: CelebratedOn above remembers only the latest
            // period; this is the shelf's material and is append-only.
            await _command.AddGoalCheerAsync(new GoalCheer
            {
                UserId = userId,
                Period = goal.Period,
                PeriodFrom = from,
                Amount = goal.Amount,
            }, ct);

            var label = GoalHandler.PeriodName(goal.Period);

            await _push.NotifyAsync(
                userId,
                language => language switch
                {
                    // A goal is a sum of money and was pushed without a
                    // currency mark, spelled by whatever culture the process
                    // ran under.
                    "ru" => ("Цель достигнута 🎉", $"{Figures.Money(goal.Amount)} за {RuPeriod(goal.Period)} — есть!"),
                    "uk" => ("Мета досягнута 🎉", $"{Figures.Money(goal.Amount)} за {UkPeriod(goal.Period)} — є!"),
                    _ => ("Goal reached 🎉", $"{Figures.Money(goal.Amount)} for the {label} — done!"),
                },
                "/stats",
                ct);
        }
    }

    private static string RuPeriod(GoalPeriod period) => period switch
    {
        GoalPeriod.Day => "день",
        GoalPeriod.Week => "неделю",
        GoalPeriod.Month => "месяц",
        _ => "год",
    };

    private static string UkPeriod(GoalPeriod period) => period switch
    {
        GoalPeriod.Day => "день",
        GoalPeriod.Week => "тиждень",
        GoalPeriod.Month => "місяць",
        _ => "рік",
    };
}
