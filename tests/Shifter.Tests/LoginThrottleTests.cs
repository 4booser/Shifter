using Shifter.Application.Common.Exceptions;
using Shifter.Application.Features.Auth.Services;

using Xunit;

namespace Shifter.Tests;

/// <summary>
/// The door itself, with the clock in hand. What happens over HTTP is checked
/// over HTTP; here is the arithmetic of when it opens again, which no test
/// should have to wait fifteen real minutes to see.
/// </summary>
public class LoginThrottleTests
{
    [Fact]
    public void The_door_survives_four_misses_and_shuts_on_the_fifth()
    {
        var throttle = new LoginThrottle(() => DateTimeOffset.UnixEpoch);

        for (var i = 0; i < 4; i++) throttle.RecordFailure("waiter");

        throttle.EnsureOpen("waiter");
        throttle.RecordFailure("waiter");

        var shut = Assert.Throws<TooManyAttemptsException>(() => throttle.EnsureOpen("waiter"));

        Assert.True(shut.RetryAfter > TimeSpan.Zero);
    }

    [Fact]
    public void The_lock_expires_on_its_own_and_the_count_starts_fresh()
    {
        var now = DateTimeOffset.UnixEpoch;
        var throttle = new LoginThrottle(() => now);

        for (var i = 0; i < 5; i++) throttle.RecordFailure("barista");
        Assert.Throws<TooManyAttemptsException>(() => throttle.EnsureOpen("barista"));

        now += TimeSpan.FromMinutes(16);

        throttle.EnsureOpen("barista");

        // Four fresh misses after the sentence — still open: the old five
        // were served, not carried over.
        for (var i = 0; i < 4; i++) throttle.RecordFailure("barista");
        throttle.EnsureOpen("barista");
    }

    [Fact]
    public void Misses_older_than_the_window_stop_counting()
    {
        var now = DateTimeOffset.UnixEpoch;
        var throttle = new LoginThrottle(() => now);

        for (var i = 0; i < 3; i++) throttle.RecordFailure("cook");

        now += TimeSpan.FromMinutes(16);

        // A forgetful typist a shift later is not the same siege.
        for (var i = 0; i < 4; i++) throttle.RecordFailure("cook");

        throttle.EnsureOpen("cook");
    }

    [Fact]
    public void The_key_ignores_case_and_a_success_opens_the_door()
    {
        var throttle = new LoginThrottle(() => DateTimeOffset.UnixEpoch);

        for (var i = 0; i < 5; i++) throttle.RecordFailure("Chef");
        Assert.Throws<TooManyAttemptsException>(() => throttle.EnsureOpen("chef"));

        throttle.Reset("CHEF");

        throttle.EnsureOpen("chef");
    }
}
