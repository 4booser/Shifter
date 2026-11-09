using System.Collections.Concurrent;
using System.Threading.Channels;

namespace Shifter.Application.Features.business.Services;

/// <summary>One goal check owed: this person's money moved on this date.</summary>
public readonly record struct GoalCheck(int UserId, DateOnly Date);

/// <summary>The goal checks still owed, so a save can ask for one and get on with answering.</summary>
// In memory on purpose. A restart loses what was waiting, which costs a cheer
// at worst: the money is already saved, and nothing is stamped until a check
// has run, so the next save in the period asks again.
public sealed class GoalCheckQueue
{
    private readonly Channel<GoalCheck> _waiting = Channel.CreateUnbounded<GoalCheck>(
        new UnboundedChannelOptions { SingleReader = true });

    private readonly ConcurrentDictionary<GoalCheck, byte> _queued = new();

    private int _unfinished;

    /// <summary>Asked for and not done yet, the one running included.</summary>
    public int Unfinished => Volatile.Read(ref _unfinished);

    /// <summary>Asks for a check. One already waiting for that date will read this save too, so a second is not queued.</summary>
    public void Enqueue(int userId, DateOnly date)
    {
        GoalCheck check = new(userId, date);

        if (!_queued.TryAdd(check, 0)) return;

        Interlocked.Increment(ref _unfinished);

        _waiting.Writer.TryWrite(check);
    }

    /// <summary>The next check, waiting for one to arrive if need be.</summary>
    public async ValueTask<GoalCheck> TakeAsync(CancellationToken ct)
    {
        GoalCheck check = await _waiting.Reader.ReadAsync(ct);

        // Let go before the check runs rather than after: a save landing while
        // it runs may have moved the money past what it read, and that save
        // has to be able to ask for another.
        _queued.TryRemove(check, out _);

        return check;
    }

    /// <summary>The check taken last is over, however it went.</summary>
    public void Finished() => Interlocked.Decrement(ref _unfinished);
}
