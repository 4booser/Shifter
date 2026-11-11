using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

using Shifter.Api.Pages;
using Shifter.Application.Features.Rosters;

namespace Shifter.Api.Controllers;

/// <summary>A roster at its link: the one page people who never signed up are sent to.</summary>
[AllowAnonymous]
[Route("r")]
public class RosterPageController : ControllerBase
{
    private readonly RosterService _rosters;

    public RosterPageController(RosterService rosters)
    {
        _rosters = rosters;
    }

    /// <summary>HEAD as well: a chat's preview may knock before it reads, and must not be told a live link is dead.</summary>
    [HttpGet("{slug:length(12)}")]
    [HttpHead("{slug:length(12)}")]
    public async Task<IActionResult> Read(string slug, [FromQuery] string? month, CancellationToken ct)
    {
        var roster = await _rosters.PageAsync(slug, month, ct);

        if (roster is null) return Gone();

        // Nothing between here and the reader may keep this: a link turned off
        // has to die at once, not when some cache gets round to it.
        Response.Headers.CacheControl = "no-store";

        return Content(
            RosterPage.Month(
                PublicPage.WantsUkrainian(Request),
                $"{Request.Scheme}://{Request.Host}",
                slug,
                roster),
            "text/html; charset=utf-8");
    }

    /// <summary>A link cut short in a chat gets the same page as a dead one, not the app's shell.</summary>
    [HttpGet("{*rest}")]
    [HttpHead("{*rest}")]
    public IActionResult Elsewhere() => Gone();

    private ContentResult Gone()
    {
        Response.Headers.CacheControl = "no-store";

        return new ContentResult
        {
            StatusCode = StatusCodes.Status404NotFound,
            ContentType = "text/html; charset=utf-8",
            Content = RosterPage.Gone(PublicPage.WantsUkrainian(Request)),
        };
    }
}
