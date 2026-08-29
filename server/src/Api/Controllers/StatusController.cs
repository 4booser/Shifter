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

    /// <summary>
    /// One screen was opened. Nothing about who opened it.
    ///
    /// The alternative was an analytics SDK: somebody else's code, watching
    /// everything, reporting to a third party — in an application whose whole
    /// argument is that it does not do that. This writes one integer.
    ///
    /// The name comes off a fixed list rather than out of the request, so a
    /// caller cannot turn this into free-text storage or smuggle an
    /// identifier through it. Anonymous on purpose: attaching a token would
    /// make the counter attributable, which is the one thing it must not be.
    /// </summary>
    [HttpPost]
    [Route("seen")]
    [EnableRateLimiting(HardeningExtensions.ContactPolicy)]
    public async Task<IActionResult> Seen([FromBody] SeenDto request, CancellationToken ct)
    {
        var screen = (request.screen ?? string.Empty).Trim().ToLowerInvariant();

        if (!Screens.Contains(screen)) return NoContent();

        var day = new Shifter.Application.Common.Time.AppClock().Today;

        // An upsert rather than a row per open: a table of events is how a
        // counter quietly becomes a log of who did what and when, even when
        // nobody meant it to.
        var rows = await _shifter.ScreenOpens
            .Where(row => row.Day == day && row.Screen == screen)
            .ExecuteUpdateAsync(set => set.SetProperty(row => row.Count, row => row.Count + 1), ct);

        if (rows == 0)
        {
            _shifter.ScreenOpens.Add(new Shifter.Domain.Entities.ScreenOpen
            {
                Day = day,
                Screen = screen,
                Count = 1,
            });

            try
            {
                await _shifter.SaveChangesAsync(ct);
            }
            catch (DbUpdateException)
            {
                // Two opens in the same millisecond raced for the first row of
                // the day. The other one won; the count is one short and
                // nothing about that is worth an error page.
            }
        }

        return NoContent();
    }

    /// <summary>
    /// The counters, for whoever wants to see what this application knows
    /// about its own use — which is exactly this and no more.
    /// </summary>
    [HttpGet]
    [Route("seen")]
    public async Task<ActionResult<object>> SeenSoFar(
        [FromQuery] DateOnly? from,
        [FromQuery] DateOnly? to,
        CancellationToken ct)
    {
        var today = new Shifter.Application.Common.Time.AppClock().Today;
        var start = from ?? today.AddDays(-29);
        var end = to ?? today;

        var rows = await _shifter.ScreenOpens
            .AsNoTracking()
            .Where(row => row.Day >= start && row.Day <= end)
            .GroupBy(row => row.Screen)
            .Select(group => new { screen = group.Key, opens = group.Sum(row => row.Count) })
            .OrderByDescending(row => row.opens)
            .ToArrayAsync(ct);

        return Ok(new { from = start, to = end, screens = rows });
    }

    /// <summary>
    /// The screens this will count. A fixed list because the alternative is
    /// storing whatever a caller sends, and whatever a caller sends is where
    /// an identifier ends up.
    /// </summary>
    private static readonly HashSet<string> Screens =
    [
        "calendar", "schedule", "gigs", "payouts", "stats", "report", "assistant",
        "bank", "account", "team", "day", "templates", "year", "cv", "payslip",
    ];

    public record SeenDto(string? screen);

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
            // The commit this container was built from. One curl after a
            // deploy answers «а тот ли код отвечает» — the assembly version
            // above has said 1.0.0.0 through every build there has been.
            build = Environment.GetEnvironmentVariable("BUILD_REF") ?? "dev",
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
