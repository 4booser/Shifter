using System.Security.Claims;

using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

using Shifter.Application.Common.Exceptions;
using Shifter.Application.Features.Gigs;

namespace Shifter.Api.Controllers;

/// <summary>
/// The freelance shift board. Reading and posting both require an account:
/// contact details move through here, and an anonymous scraper is exactly
/// who they must not move to.
/// </summary>
[Authorize]
[Route("shifter/v1/gigs")]
public class GigsController : ControllerBase
{
    private readonly GigService _gigs;

    public GigsController(GigService gigs) => _gigs = gigs;

    [HttpGet]
    public async Task<IActionResult> Board(
        [FromQuery] DateOnly from, [FromQuery] DateOnly to,
        [FromQuery] string? category, [FromQuery] string? city,
        [FromQuery] string? employment, CancellationToken ct)
        => Ok(await _gigs.BoardAsync(UserId(), from, to, category, city, employment, ct));

    [HttpPost]
    public async Task<IActionResult> Create([FromBody] GigSaveDto request, CancellationToken ct)
        => Ok(await _gigs.SaveAsync(UserId(), null, request, ct));

    [HttpPut("{id:int}")]
    public async Task<IActionResult> Update(int id, [FromBody] GigSaveDto request, CancellationToken ct)
        => Ok(await _gigs.SaveAsync(UserId(), id, request, ct));

    [HttpPut("{id:int}/status")]
    public async Task<IActionResult> SetStatus(int id, [FromBody] GigStatusDto request, CancellationToken ct)
        => Ok(await _gigs.SetStatusAsync(UserId(), id, request.status, ct));

    [HttpPost("{id:int}/reviews")]
    public async Task<IActionResult> Review(int id, [FromBody] ReviewSaveDto request, CancellationToken ct)
        => Ok(await _gigs.ReviewAsync(UserId(), id, request, ct));

    [HttpGet("reputation/{userId:int}")]
    public async Task<IActionResult> Reputation(int userId, CancellationToken ct)
        => Ok(await _gigs.ReputationAsync(userId, ct));

    [HttpGet("reviews/pending")]
    public async Task<IActionResult> PendingReviews(CancellationToken ct)
        => Ok(await _gigs.PendingReviewsAsync(UserId(), ct));

    [HttpGet("seekers")]
    public async Task<IActionResult> Seekers(
        [FromQuery] string? category, [FromQuery] string? city,
        [FromQuery] string? employment, CancellationToken ct)
        => Ok(await _gigs.SeekersAsync(UserId(), category, city, employment, ct));

    [HttpGet("seeker")]
    public async Task<IActionResult> MySeeker(CancellationToken ct)
        => Ok(await _gigs.MySeekerAsync(UserId(), ct) as object ?? new { });

    [HttpPut("seeker")]
    public async Task<IActionResult> SaveSeeker([FromBody] SeekerSaveDto request, CancellationToken ct)
        => Ok(await _gigs.SaveSeekerAsync(UserId(), request, ct));

    [HttpGet("mine")]
    public async Task<IActionResult> Mine(CancellationToken ct)
        => Ok(await _gigs.MineAsync(UserId(), ct));

    [HttpGet("replies")]
    public async Task<IActionResult> MyReplies(CancellationToken ct)
        => Ok(await _gigs.MyRepliesAsync(UserId(), ct));

    [HttpPost("{id:int}/respond")]
    public async Task<IActionResult> Respond(int id, [FromBody] GigRespondDto request, CancellationToken ct)
        => Ok(await _gigs.RespondAsync(UserId(), id, request, ct));

    [HttpDelete("{id:int}/respond")]
    public async Task<IActionResult> Withdraw(int id, CancellationToken ct)
    {
        await _gigs.WithdrawAsync(UserId(), id, ct);

        return NoContent();
    }

    [HttpPost("{id:int}/replies/{replyId:int}/accept")]
    public async Task<IActionResult> Accept(int id, int replyId, CancellationToken ct)
        => Ok(await _gigs.AcceptAsync(UserId(), id, replyId, ct));

    private int UserId()
    {
        var id = User.FindFirstValue(ClaimTypes.NameIdentifier);

        if (!int.TryParse(id, out var userId))
            throw new UnauthorizedException("Token is missing the required claims.");

        return userId;
    }
}

public record GigStatusDto(string? status);
