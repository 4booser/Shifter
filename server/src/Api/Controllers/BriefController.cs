using System.Security.Claims;

using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

using Shifter.Application.Common.Exceptions;
using Shifter.Application.Features.Brief;

namespace Shifter.Api.Controllers;

/// <summary>The daily brief, computed by us and worded once a day.</summary>
[Authorize]
[Route("shifter/v1/brief")]
public class BriefController : ControllerBase
{
    private readonly BriefService _briefs;

    public BriefController(BriefService briefs) => _briefs = briefs;

    [HttpGet("today")]
    public async Task<IActionResult> Today([FromQuery] DateOnly? date, CancellationToken ct)
    {
        // The client sends its own local date: a brief about "today" written
        // in UTC is about yesterday for half the planet.
        var today = date ?? DateOnly.FromDateTime(DateTime.UtcNow);
        var brief = await _briefs.ForTodayAsync(UserId(), today, ct);

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
