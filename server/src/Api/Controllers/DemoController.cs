using System.Collections.Concurrent;
using System.Security.Cryptography;

using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

using Shifter.Application.Common.Exceptions;
using Shifter.Application.Common.Time;
using Shifter.Application.Features.Auth.DTOs;
using Shifter.Application.Features.Auth.Services.Interfaces;
using Shifter.Application.Features.Demo;
using Shifter.Domain.Entities;
using Shifter.Infrastructure.Persistence.DbContexts;

namespace Shifter.Api.Controllers;

/// <summary>«Посмотреть на примере» for the whole application.</summary>
[AllowAnonymous]
[Route("shifter/v1/demo")]
public sealed class DemoController : ControllerBase
{
    private readonly ShifterDbContext _db;
    private readonly IAuthTokenIssuer _issuer;
    private readonly AppClock _clock;
    private readonly ILogger<DemoController> _logger;

    public DemoController(
        ShifterDbContext db,
        IAuthTokenIssuer issuer,
        AppClock clock,
        ILogger<DemoController> logger)
    {
        _db = db;
        _issuer = issuer;
        _clock = clock;
        _logger = logger;
    }

    /* Five a quarter of an hour from one address. */
    // Five rather than three: the suite that proves this works asks for
    // three of them in a row from one address, and a limit a test trips over
    // is a limit somebody will quietly raise at the wrong moment.
    private const int PerWindow = 5;
    private static readonly TimeSpan Window = TimeSpan.FromMinutes(15);
    private static readonly ConcurrentDictionary<string, List<DateTimeOffset>> Recent = new();

    [HttpPost]
    public async Task<ActionResult<AuthResponseDto>> Start(CancellationToken ct)
    {
        Allow(HttpContext.Connection.RemoteIpAddress?.ToString() ?? "unknown");

        await SweepAsync(ct);

        DateTime now = DateTime.UtcNow;

        var user = new User
        {
            FirstName = "Аня",
            LastName = "Пример",
            // Deliberately impossible to log into: a demonstration account is
            // reached by pressing the button, and a password would make it an
            // account somebody could come back to and find swept.
            Login = $"demo-{Slug()}",
            PasswordHash = null,
            CreatedAt = now,
            LastLogin = now,
            DemoUntil = now + DemoWorld.Lifetime,
            MonthlyGoal = 32_000m,
        };

        _db.Users.Add(user);
        await _db.SaveChangesAsync(ct);

        await DemoWorld.SeedAsync(_db, user, _clock.Today, ct);

        _logger.LogInformation("Demo account {UserId} seeded.", user.Id);

        return Ok(await _issuer.IssueAsync(user.Id, user.Login, ct));
    }

    private static string Slug()
        => Convert.ToHexString(RandomNumberGenerator.GetBytes(5)).ToLowerInvariant();

    private static void Allow(string address)
    {
        var now = DateTimeOffset.UtcNow;

        var seen = Recent.AddOrUpdate(
            address,
            _ => [now],
            (_, list) =>
            {
                lock (list)
                {
                    list.RemoveAll(at => now - at > Window);
                    list.Add(now);

                    return list;
                }
            });

        int count;

        lock (seen) count = seen.Count;

        if (count > PerWindow)
        {
            throw new TooManyAttemptsException(
                "Too many demonstration accounts from here. Try again in a quarter of an hour.",
                Window);
        }
    }

    /// <summary>Yesterday's visitors, removed.</summary>
    private async Task SweepAsync(CancellationToken ct)
    {
        DateTime now = DateTime.UtcNow;

        var stale = await _db.Users
            .Where(row => row.DemoUntil != null && row.DemoUntil < now)
            .Take(20)
            .ToListAsync(ct);

        if (stale.Count == 0) return;

        _db.Users.RemoveRange(stale);
        await _db.SaveChangesAsync(ct);

        _logger.LogInformation("Swept {Count} expired demonstration accounts.", stale.Count);
    }
}
