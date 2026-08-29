using System.Collections.Concurrent;
using Shifter.Application.Common.Exceptions;

namespace Shifter.Application.Features.Auth.Services;

/// <summary>
/// Five wrong passwords in a quarter hour close the door for a quarter hour —
/// for the right password too, because a lock that only stops wrong guesses
/// stops nothing. A successful sign-in opens it and clears the count.
///
/// The count lives in process memory on purpose: the app runs as a single
/// instance, and a table for this would outlive its own usefulness — a
/// restart forgiving all counters is an acceptable cost of that honesty.
/// </summary>
public sealed class LoginThrottle
{
    public const int Limit = 5;
    public static readonly TimeSpan Window = TimeSpan.FromMinutes(15);

    private sealed record Entry(int Fails, DateTimeOffset FirstFailAt, DateTimeOffset? LockedUntil);

    private readonly ConcurrentDictionary<string, Entry> _doors = new();
    private readonly Func<DateTimeOffset> _now;

    public LoginThrottle(Func<DateTimeOffset>? now = null)
    {
        _now = now ?? (() => DateTimeOffset.UtcNow);
    }

    /// <summary>Throws 429 while the door is shut; otherwise does nothing.</summary>
    public void EnsureOpen(string login)
    {
        if (!_doors.TryGetValue(Key(login), out var entry) || entry.LockedUntil is null) return;

        var left = entry.LockedUntil.Value - _now();

        if (left <= TimeSpan.Zero)
        {
            // Served its time; the next failure starts a fresh count.
            _doors.TryRemove(Key(login), out _);
            return;
        }

        throw new TooManyAttemptsException(
            "Too many attempts. The door is closed for a while; try again later.",
            left);
    }

    public void RecordFailure(string login)
    {
        var now = _now();

        _doors.AddOrUpdate(
            Key(login),
            _ => new Entry(1, now, null),
            (_, entry) =>
            {
                // Old misses do not add up forever: outside the window the
                // count restarts instead of ambushing a forgetful typist.
                if (entry.LockedUntil is null && now - entry.FirstFailAt > Window)
                    return new Entry(1, now, null);

                var fails = entry.Fails + 1;

                return fails >= Limit
                    ? new Entry(fails, entry.FirstFailAt, now + Window)
                    : entry with { Fails = fails };
            });
    }

    public void Reset(string login) => _doors.TryRemove(Key(login), out _);

    private static string Key(string login) => login.Trim().ToLowerInvariant();
}
