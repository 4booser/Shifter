using System.Diagnostics;

using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.EntityFrameworkCore;

using Shifter.Api.Extensions;
using Shifter.Application.Features.Diagnostics;
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
    private readonly ILogger<StatusController> _log;

    public StatusController(
        ShifterDbContext shifter,
        TokensDbContext tokens,
        ILogger<StatusController> log)
    {
        _shifter = shifter;
        _tokens = tokens;
        _log = log;
    }

    /// <summary>
    /// A crash the browser saw. The page has collected these since the first
    /// line of script on it, and until now they went nowhere — which meant a
    /// white screen was something we heard about from the person it happened
    /// to, days later, described from memory.
    ///
    /// Anonymous because a page can break before anybody has logged in, and
    /// scrubbed on the way in because a stack trace from a live page can carry
    /// an address or a token in it. Nothing here identifies a person: what
    /// broke, on which page, on which build.
    /// </summary>
    [HttpPost]
    [Route("client-error")]
    [EnableRateLimiting(HardeningExtensions.ClientErrorPolicy)]
    public IActionResult ClientError([FromBody] ClientErrorDto request)
    {
        string message = ClientErrorReport.Clean(request.message);

        // An empty report is a client bug of its own, not something to log.
        if (message.Length == 0) return NoContent();

        _log.LogWarning(
            "Client error on {Path} (build {Build}): {Message}",
            ClientErrorReport.CleanPath(request.path),
            ClientErrorReport.CleanBuild(request.build),
            message);

        return NoContent();
    }

    /// <summary>What a broken page is allowed to tell us about itself.</summary>
    public record ClientErrorDto(string? message, string? path, string? build);

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
