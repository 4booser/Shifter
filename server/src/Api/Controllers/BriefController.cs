using System.Security.Claims;

using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;

using Shifter.Api.Extensions;

using Shifter.Application.Common.Exceptions;
using Shifter.Application.Features.Brief;

namespace Shifter.Api.Controllers;

/// <summary>The daily brief, computed by us and worded once a day.</summary>
[Authorize]
// The brief rewrites itself whenever the month's total moves, so a client in
// a loop is a client spending money at the model. The assistant's ceiling
// fits here for the same reason.
[EnableRateLimiting(HardeningExtensions.AssistantPolicy)]
[Route("shifter/v1/brief")]
public class BriefController : ControllerBase
{
    private readonly BriefService _briefs;

    public BriefController(BriefService briefs) => _briefs = briefs;

    [HttpGet("today")]
    public async Task<IActionResult> Today(
        [FromQuery] DateOnly? date,
        [FromQuery] string? lang,
        CancellationToken ct)
    {
        // The client sends its own local date: a brief about "today" written
        // in UTC is about yesterday for half the planet.
        var today = date ?? DateOnly.FromDateTime(DateTime.UtcNow);
        var brief = await _briefs.ForTodayAsync(UserId(), today, ct, lang);

        return Ok(new
        {
            date = brief.Date.ToString("yyyy-MM-dd"),
            headline = brief.Headline,
            body = brief.Body,
            tip = brief.Tip,
            mood = brief.Mood,
            source = brief.Source,
        });
    }

    /// <summary>
    /// The day page under the calendar: today, the month, what the figures
    /// noticed, and what is coming. Sections with nothing to say are absent
    /// rather than empty — a page that pads itself teaches people to skim it.
    /// </summary>
    [HttpGet("blocks")]
    public async Task<IActionResult> Blocks(
        [FromQuery] DateOnly? date,
        [FromQuery] string? lang,
        CancellationToken ct)
        => Ok(await _briefs.BlocksAsync(
            UserId(), date ?? DateOnly.FromDateTime(DateTime.UtcNow), ct, lang));

    /// <summary>The facts the brief was written from — the "show your work" button.</summary>
    [HttpGet("facts")]
    public async Task<IActionResult> Facts([FromQuery] DateOnly? date, CancellationToken ct)
        => Ok(await _briefs.GatherAsync(UserId(), date ?? DateOnly.FromDateTime(DateTime.UtcNow), ct));

    private int UserId()
    {
        var id = User.FindFirstValue(ClaimTypes.NameIdentifier);

        if (!int.TryParse(id, out var userId))
            throw new UnauthorizedException("Token is missing the required claims.");

        return userId;
    }
}
