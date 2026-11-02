using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Shifter.Application.Features.business.Services.Interfaces;

namespace Shifter.Application.Features.business.Services;

/// <summary>Works through the goal checks saves and closes ask for, one at a time and away from anybody waiting on an answer.</summary>
public sealed class GoalCheckWorker : BackgroundService
{
    private readonly GoalCheckQueue _queue;
    private readonly IServiceScopeFactory _scopes;
    private readonly ILogger<GoalCheckWorker> _logger;

    public GoalCheckWorker(
        GoalCheckQueue queue,
        IServiceScopeFactory scopes,
        ILogger<GoalCheckWorker> logger)
    {
        _queue = queue;
        _scopes = scopes;
        _logger = logger;
    }

    protected override async Task ExecuteAsync(CancellationToken ct)
    {
        while (!ct.IsCancellationRequested)
        {
            GoalCheck check = await _queue.TakeAsync(ct);

            try
            {
                await RunAsync(check, ct);
            }
            // Only the app stopping ends this loop. A cancellation it did not
            // ask for, like a call timing out deep inside a check, is a failure
            // like any other: let through, it would stop every cheer for
            // everybody while the queue went on filling. A failed check costs
            // one cheer, and the next save in the period asks again.
            catch (Exception exception) when (!ct.IsCancellationRequested)
            {
                _logger.LogWarning(exception, "Goal check failed for {Date}", check.Date);
            }
            finally
            {
                _queue.Finished();
            }
        }
    }

    private async Task RunAsync(GoalCheck check, CancellationToken ct)
    {
        using var scope = _scopes.CreateScope();

        var days = scope.ServiceProvider.GetRequiredService<IDayHandler>();
        var goals = scope.ServiceProvider.GetRequiredService<GoalCelebrator>();

        await goals.CheckAsync(
            check.UserId,
            check.Date,
            async (from, to) => (await days.ListAsync(check.UserId, from, to, ct)).total_earned,
            ct);
    }
}
