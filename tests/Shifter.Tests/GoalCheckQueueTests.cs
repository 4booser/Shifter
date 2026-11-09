using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging.Abstractions;

using Shifter.Application.Common.Exceptions;
using Shifter.Application.Features.business.DTOs;
using Shifter.Application.Features.business.Services;
using Shifter.Application.Features.business.Services.Interfaces;
using Shifter.Application.Features.Push;
using Shifter.Domain.Entities;
using Shifter.Infrastructure.Repositories.Interfaces;

using Xunit;

namespace Shifter.Tests;

/// <summary>A goal check is asked for by a save and answered beside it, so nobody typing a tip waits for one.</summary>
public class GoalCheckQueueTests
{
    private static readonly DateOnly Friday = new(2026, 11, 6);

    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    private static DaySaveDto Tips(decimal tips)
        => new([], null, tips, null, null, null, null);

    /// <summary>Remembers who was cheered, and can fail the way a call that timed out fails.</summary>
    private sealed class Phone : IPushNotifier
    {
        public List<int> Told { get; } = [];

        public Exception? Failure { get; set; }

        public Task NotifyAsync(
            int userId,
            Func<string, (string Title, string Body)> text,
            string url,
            CancellationToken ct,
            string? category = null)
        {
            if (Failure is Exception failure)
            {
                Failure = null;

                throw failure;
            }

            Told.Add(userId);

            return Task.CompletedTask;
        }
    }

    private static Day Earned(int userId) => new()
    {
        UserId = userId,
        Date = Friday,
        Tips = 1_000m,
        Shifts = [],
        Sales = [],
    };

    private static Goal Daily(int id, int userId) => new()
    {
        Id = id,
        UserId = userId,
        Period = GoalPeriod.Day,
        Amount = 500m,
    };

    /// <summary>The worker running over fakes until every check in the queue is done.</summary>
    private static async Task RunAsync(GoalCheckQueue queue, FakeShifterQuery query, Phone phone)
    {
        ServiceCollection services = new();

        services.AddSingleton<IShifterQuery>(query);
        services.AddSingleton<IShifterCommand>(new FakeShifterCommand(query));
        services.AddSingleton<IPushNotifier>(phone);
        services.AddScoped<GoalCelebrator>();
        services.AddScoped<IDayHandler>(provider => new DayHandler(
            provider.GetRequiredService<IShifterCommand>(),
            provider.GetRequiredService<IShifterQuery>()));

        await using ServiceProvider provider = services.BuildServiceProvider();

        GoalCheckWorker worker = new(
            queue,
            provider.GetRequiredService<IServiceScopeFactory>(),
            NullLogger<GoalCheckWorker>.Instance);

        await worker.StartAsync(Ct);

        using CancellationTokenSource patience = new(TimeSpan.FromSeconds(10));

        while (queue.Unfinished > 0) await Task.Delay(5, patience.Token);

        await worker.StopAsync(Ct);
    }

    [Fact]
    public async Task Repeats_of_a_date_wait_as_one_check()
    {
        GoalCheckQueue queue = new();

        queue.Enqueue(Build.UserId, Friday);
        queue.Enqueue(Build.UserId, Friday);
        queue.Enqueue(Build.UserId, Friday);

        Assert.Equal(1, queue.Unfinished);
        Assert.Equal(new GoalCheck(Build.UserId, Friday), await queue.TakeAsync(Ct));
        Assert.False(queue.TakeAsync(Ct).IsCompleted);
    }

    [Fact]
    public async Task A_save_during_a_check_gets_one_of_its_own()
    {
        GoalCheckQueue queue = new();

        queue.Enqueue(Build.UserId, Friday);

        await queue.TakeAsync(Ct);

        // The one running may already have read past this save, and the rest
        // of a burst waits behind it as usual.
        queue.Enqueue(Build.UserId, Friday);
        queue.Enqueue(Build.UserId, Friday);

        Assert.Equal(2, queue.Unfinished);
        Assert.Equal(new GoalCheck(Build.UserId, Friday), await queue.TakeAsync(Ct));
        Assert.False(queue.TakeAsync(Ct).IsCompleted);
    }

    [Fact]
    public async Task Other_days_and_other_people_are_not_repeats()
    {
        GoalCheckQueue queue = new();

        queue.Enqueue(1, Friday);
        queue.Enqueue(1, Friday.AddDays(1));
        queue.Enqueue(2, Friday);

        Assert.Equal(3, queue.Unfinished);

        Assert.Equal(new GoalCheck(1, Friday), await queue.TakeAsync(Ct));
        Assert.Equal(new GoalCheck(1, Friday.AddDays(1)), await queue.TakeAsync(Ct));
        Assert.Equal(new GoalCheck(2, Friday), await queue.TakeAsync(Ct));
    }

    [Fact]
    public async Task A_check_is_unfinished_until_it_is_over_rather_than_until_it_is_taken()
    {
        GoalCheckQueue queue = new();

        queue.Enqueue(Build.UserId, Friday);

        await queue.TakeAsync(Ct);

        Assert.Equal(1, queue.Unfinished);

        queue.Finished();

        Assert.Equal(0, queue.Unfinished);
    }

    [Fact]
    public async Task A_save_asks_for_a_check_and_leaves_it_to_the_worker()
    {
        FakeShifterQuery query = new();
        GoalCheckQueue queue = new();
        Goal goal = Daily(1, Build.UserId);

        query.Goals.Add(goal);

        DayHandler handler = new(new FakeShifterCommand(query), query, goals: queue);

        await handler.SaveAsync(Tips(1_000m), Build.UserId, Friday, Ct);

        Assert.Equal(1, queue.Unfinished);
        Assert.Null(goal.CelebratedOn);
        Assert.Equal(new GoalCheck(Build.UserId, Friday), await queue.TakeAsync(Ct));
    }

    [Fact]
    public async Task A_save_refused_asks_for_nothing()
    {
        FakeShifterQuery query = new();
        GoalCheckQueue queue = new();

        DayHandler handler = new(new FakeShifterCommand(query), query, goals: queue);

        await Assert.ThrowsAsync<ValidationException>(
            () => handler.SaveAsync(Tips(-1m), Build.UserId, Friday, Ct));

        Assert.Equal(0, queue.Unfinished);
    }

    [Fact]
    public async Task The_worker_cheers_what_was_crossed_and_only_once()
    {
        FakeShifterQuery query = new();
        GoalCheckQueue queue = new();
        Phone phone = new();

        query.Days.Add(Earned(1));
        query.Goals.Add(Daily(1, 1));

        queue.Enqueue(1, Friday);

        await RunAsync(queue, query, phone);

        queue.Enqueue(1, Friday);

        await RunAsync(queue, query, phone);

        Assert.Equal([1], phone.Told);
    }

    [Theory]
    [InlineData(false)]
    [InlineData(true)]
    public async Task A_check_that_fails_leaves_the_ones_behind_it_running(bool cancelled)
    {
        FakeShifterQuery query = new();
        GoalCheckQueue queue = new();

        // A cancellation nobody at the worker asked for is what a call timing
        // out inside a check looks like, and it must not read as the app
        // stopping.
        Phone phone = new()
        {
            Failure = cancelled
                ? new OperationCanceledException()
                : new InvalidOperationException("The phone is off."),
        };

        query.Days.AddRange(Earned(1), Earned(2));
        query.Goals.AddRange(Daily(1, 1), Daily(2, 2));

        queue.Enqueue(1, Friday);
        queue.Enqueue(2, Friday);

        await RunAsync(queue, query, phone);

        Assert.Equal([2], phone.Told);
        Assert.Equal(0, queue.Unfinished);
    }
}
