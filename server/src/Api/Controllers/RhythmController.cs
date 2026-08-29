using System.Security.Claims;

using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;

using Shifter.Api.Extensions;
using Shifter.Application.Common.Exceptions;
using Shifter.Application.Features.Rhythm;

namespace Shifter.Api.Controllers;

/// <summary>The rota's rhythm: sleep windows and what long runs cost.</summary>
[Authorize]
[Route("shifter/v1/rhythm")]
[EnableRateLimiting(HardeningExtensions.ApiPolicy)]
public class RhythmController : ControllerBase
{
    private readonly RhythmService _rhythm;

    public RhythmController(RhythmService rhythm) => _rhythm = rhythm;

    [HttpGet("rest")]
    public async Task<IActionResult> Rest(
        [FromQuery] DateOnly from, [FromQuery] DateOnly to, CancellationToken ct)
    {
        var read = await _rhythm.RestAsync(UserId(), from, to, ct);

        return Ok(new
        {
            threshold = read.Threshold,
            windows = read.Windows.Select(window => new
            {
                ended = window.Ended,
                resumed = window.Resumed,
                hours = window.Hours,
                @short = window.Short,
            }),
            short_count = read.ShortCount,
            shortest = read.Shortest,
        });
    }

    /// <summary>Null-shaped honesty: too little data answers 204, not zeros.</summary>
    [HttpGet("fatigue")]
    public async Task<IActionResult> Fatigue(CancellationToken ct)
    {
        var verdict = await _rhythm.FatigueAsync(
            UserId(), DateOnly.FromDateTime(DateTime.UtcNow), ct);

        if (verdict is null) return NoContent();

        return Ok(new
        {
            fresh_days = verdict.FreshDays,
            deep_days = verdict.DeepDays,
            fresh_per_hour = verdict.FreshPerHour,
            deep_per_hour = verdict.DeepPerHour,
            percent = verdict.Percent,
            noticeable = verdict.IsNoticeable,
        });
    }

    private int UserId()
    {
        var id = User.FindFirstValue(ClaimTypes.NameIdentifier);

        if (!int.TryParse(id, out var userId))
            throw new UnauthorizedException("Token is missing the required claims.");

        return userId;
    }
}
