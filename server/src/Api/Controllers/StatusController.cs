using System.Diagnostics;

using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

using Shifter.Infrastructure.Persistence.DbContexts;

namespace Shifter.Api.Controllers;

/// <summary>
/// What the service can say about itself, out loud. A status page that only
/// the owner can read is a diary; this one answers anybody, and it answers
/// with facts it can actually prove — can each database be reached, how long
/// has this process been up, which build is running.
///
/// Nothing here counts users or reveals data: an uptime page is a promise
/// about availability, not a window into the tenants.
/// </summary>
[AllowAnonymous]
[Route("shifter/v1/status")]
public class StatusController : ControllerBase
{
    private static readonly DateTime Started = DateTime.UtcNow;

    private readonly ShifterDbContext _shifter;
    private readonly TokensDbContext _tokens;

    public StatusController(ShifterDbContext shifter, TokensDbContext tokens)
    {
        _shifter = shifter;
        _tokens = tokens;
    }

    [HttpGet]
    public async Task<IActionResult> Get(CancellationToken ct)
    {
        var (calendarUp, calendarMs) = await PingAsync(_shifter, ct);
        var (tokensUp, tokensMs) = await PingAsync(_tokens, ct);

        var uptime = DateTime.UtcNow - Started;

        return Ok(new
        {
            ok = calendarUp && tokensUp,
            checked_at = DateTime.UtcNow.ToString("O"),
            uptime_seconds = (long)uptime.TotalSeconds,
            version = typeof(StatusController).Assembly.GetName().Version?.ToString() ?? "dev",
            services = new object[]
            {
                new { name = "api", ok = true, latency_ms = 0 },
                new { name = "calendar-database", ok = calendarUp, latency_ms = calendarMs },
                new { name = "accounts-database", ok = tokensUp, latency_ms = tokensMs },
            },
        });
    }

    /// <summary>A round trip to the database, timed — the only honest liveness answer.</summary>
    private static async Task<(bool Ok, long Ms)> PingAsync(DbContext context, CancellationToken ct)
    {
        var clock = Stopwatch.StartNew();

        try
        {
            var ok = await context.Database.CanConnectAsync(ct);

            return (ok, clock.ElapsedMilliseconds);
        }
        catch
        {
            return (false, clock.ElapsedMilliseconds);
        }
    }
}
