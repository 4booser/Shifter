using System.Security.Claims;

using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;

using Shifter.Api.Extensions;

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
    private readonly MarketService _market;
    private readonly CityCompareService _cities;

    public GigsController(GigService gigs, MarketService market, CityCompareService cities)
    {
        _gigs = gigs;
        _market = market;
        _cities = cities;
    }

    /// <summary>
    /// What the board pays for a job in a city, and where the caller sits in
    /// it. Absent rather than zeroed where the sample cannot carry a figure.
    /// </summary>
    /// <summary>«Где мой час дороже»: own history city by city, market alongside.</summary>
    [HttpGet("cities")]
    public async Task<IActionResult> Cities(CancellationToken ct)
        => Ok((await _cities.ReadAsync(UserId(), ct)).Select(row => new
        {
            city = row.City,
            hours = row.Hours,
            days = row.Days,
            per_hour = row.PerHour,
            market = row.Market is null ? null : new
            {
                median = row.Market.Median,
                low = row.Market.Low,
                high = row.Market.High,
                employers = row.Market.Employers,
                listings = row.Market.Listings,
            },
        }));

    [HttpGet("market")]
    public async Task<IActionResult> Market(
        [FromQuery] string city, [FromQuery] string category, CancellationToken ct)
    {
        var reading = await _market.ReadAsync(
            UserId(), (city ?? string.Empty).Trim(), GigRules.ParseCategory(category), ct);

        return Ok(new
        {
            // Null all the way down where there are not enough separate
            // employers behind the number. A client cannot round a null up
            // into a confident figure the way it can round a zero.
            median = reading.Band?.Median,
            low = reading.Band?.Low,
            high = reading.Band?.High,
            employers = reading.Band?.Employers,
            listings = reading.Band?.Listings,
            mine = reading.Mine,
            standing = reading.Standing,
        });
    }

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

    [HttpGet("known-workers")]
    public async Task<IActionResult> KnownWorkers(CancellationToken ct)
        => Ok(await _gigs.KnownWorkersAsync(UserId(), ct));

    [HttpPost("{id:int}/invite/{inviteeUserId:int}")]
    [EnableRateLimiting(HardeningExtensions.ContactPolicy)]
    public async Task<IActionResult> Invite(int id, int inviteeUserId, CancellationToken ct)
    {
        await _gigs.InviteAsync(UserId(), id, inviteeUserId, ct);

        return NoContent();
    }

    [HttpPost("{id:int}/reviews")]
    [EnableRateLimiting(HardeningExtensions.ContactPolicy)]
    public async Task<IActionResult> Review(int id, [FromBody] ReviewSaveDto request, CancellationToken ct)
        => Ok(await _gigs.ReviewAsync(UserId(), id, request, ct));

    /// <summary>
    /// Somebody's standing on the board. Readable about people who have put
    /// themselves in front of you — a card, an open listing, a conversation
    /// you have already had — and about yourself. Not about anybody whose id
    /// you can guess.
    /// </summary>
    [HttpGet("reputation/{userId:int}")]
    public async Task<IActionResult> Reputation(int userId, CancellationToken ct)
        => Ok(await _gigs.ReputationAsync(userId, UserId(), ct));

    [HttpGet("reviews/pending")]
    public async Task<IActionResult> PendingReviews(CancellationToken ct)
        => Ok(await _gigs.PendingReviewsAsync(UserId(), ct));

    /// <summary>
    /// The people looking for work. This is the read that actually hands over
    /// phone numbers, so it carries the same ceiling as the three writes that
    /// take one — it had none, and two hundred cards a call at the general
    /// limit is a harvesting tool rather than a job search.
    /// </summary>
    [HttpGet("seekers")]
    [EnableRateLimiting(HardeningExtensions.ContactPolicy)]
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
    [EnableRateLimiting(HardeningExtensions.ContactPolicy)]
    public async Task<IActionResult> Respond(int id, [FromBody] GigRespondDto request, CancellationToken ct)
        => Ok(await _gigs.RespondAsync(UserId(), id, request, ct));

    /// <summary>
    /// The person's yes on a quiet reply: their contacts go to the venue now.
    /// Rate-limited like the reply itself — it carries the same data.
    /// </summary>
    [HttpPost("{id:int}/respond/open")]
    [EnableRateLimiting(HardeningExtensions.ContactPolicy)]
    public async Task<IActionResult> Open(int id, [FromBody] GigRespondDto request, CancellationToken ct)
        => Ok(await _gigs.OpenAsync(UserId(), id, request, ct));

    [HttpDelete("{id:int}/respond")]
    public async Task<IActionResult> Withdraw(int id, CancellationToken ct)
    {
        await _gigs.WithdrawAsync(UserId(), id, ct);

        return NoContent();
    }

    [HttpPost("{id:int}/replies/{replyId:int}/accept")]
    public async Task<IActionResult> Accept(
        int id, int replyId, [FromBody] GigAcceptDto? request, CancellationToken ct)
        => Ok(await _gigs.AcceptAsync(UserId(), id, replyId, request, ct));

    private int UserId()
    {
        var id = User.FindFirstValue(ClaimTypes.NameIdentifier);

        if (!int.TryParse(id, out var userId))
            throw new UnauthorizedException("Token is missing the required claims.");

        return userId;
    }
}

public record GigStatusDto(string? status);
