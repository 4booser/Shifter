using System.Security.Claims;
using Shifter.Infrastructure.Persistence.DbContexts;
using Shifter.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using MediatR;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using Shifter.Api.Extensions;
using Shifter.Application.Common.Exceptions;
using Shifter.Application.Features.Account.DTOs;

namespace Shifter.Api.Controllers;

/// <summary>
/// The account itself, as opposed to signing in and out. Every route reads the
/// user id from the token: the body carries what to change, never whose.
/// </summary>
[Authorize]
[EnableRateLimiting(HardeningExtensions.AuthPolicy)]
[Route("shifter/v1/account")]
public class AccountController : Controller
{
    private readonly IMediator _mediator;
    private readonly ShifterDbContext _db;

    public AccountController(IMediator mediator, ShifterDbContext db)
    {
        _mediator = mediator;
        _db = db;
    }

    [HttpGet]
    public async Task<ActionResult<ProfileDto>> Get(CancellationToken ct)
        => Ok(await _mediator.Send(new GetProfileDto(UserId()), ct));

    [HttpPut]
    public async Task<ActionResult<ProfileDto>> Update(
        [FromBody] UpdateProfileBody request,
        CancellationToken ct)
        => Ok(await _mediator.Send(
            new UpdateProfileDto(UserId(), request.first_name, request.last_name), ct));

    [HttpPut]
    [Route("password")]
    public async Task<ActionResult<ProfileDto>> ChangePassword(
        [FromBody] ChangePasswordBody request,
        CancellationToken ct)
        => Ok(await _mediator.Send(
            new ChangePasswordDto(UserId(), request.current_password, request.new_password), ct));

    /// <summary>
    /// Attaches a Google account to this one. Afterwards either the password
    /// or the Google button reaches the same data.
    /// </summary>
    [HttpPost]
    [Route("google")]
    public async Task<ActionResult<ProfileDto>> LinkGoogle(
        [FromBody] LinkGoogleBody request,
        CancellationToken ct)
        => Ok(await _mediator.Send(new LinkGoogleDto(UserId(), request.credential), ct));

    [HttpDelete]
    [Route("google")]
    public async Task<ActionResult<ProfileDto>> UnlinkGoogle(CancellationToken ct)
        => Ok(await _mediator.Send(new UnlinkGoogleDto(UserId()), ct));

    /// <summary>
    /// What the public card shows, and whether there is one at all.
    /// </summary>
    [HttpGet]
    [Route("card")]
    public async Task<ActionResult<CardSettingsDto>> GetCard(CancellationToken ct)
    {
        User user = await Me(ct);

        return Ok(new CardSettingsDto(
            user.CardSlug is not null, user.CardShowsPlaces, user.CardShowsMoney, user.CardSlug));
    }

    /// <summary>
    /// Switches the card on or off and decides what it shows.
    ///
    /// Turning it off drops the slug rather than hiding the page, so the link
    /// somebody already sent stops resolving — a link that still works is not
    /// a revocation anybody believes. Turning it back on mints a new one,
    /// because whoever switched it off decided the people holding the old link
    /// should not have it.
    /// </summary>
    [HttpPut]
    [Route("card")]
    public async Task<ActionResult<CardSettingsDto>> SetCard(
        [FromBody] CardSettingsDto request,
        CancellationToken ct)
    {
        User user = await Me(ct);

        if (!request.on) user.CardSlug = null;
        else user.CardSlug ??= GigListing.NewSlug();

        // Both stay off while the card is off, so switching it back on never
        // republishes an answer somebody gave months ago and forgot about.
        user.CardShowsPlaces = request.on && request.show_places;
        user.CardShowsMoney = request.on && request.show_money;

        await _db.SaveChangesAsync(ct);

        return Ok(new CardSettingsDto(
            user.CardSlug is not null, user.CardShowsPlaces, user.CardShowsMoney, user.CardSlug));
    }

    [HttpDelete]
    public async Task<IActionResult> Delete(
        [FromBody] DeleteAccountBody request,
        CancellationToken ct)
    {
        await _mediator.Send(
            new DeleteAccountDto(UserId(), request.password, request.confirm_login), ct);

        return NoContent();
    }

    private async Task<User> Me(CancellationToken ct)
        => await _db.Users.FirstOrDefaultAsync(row => row.Id == UserId(), ct)
           ?? throw new NotFoundException("Account does not exist.");

    private int UserId()
    {
        if (!int.TryParse(User.FindFirstValue(ClaimTypes.NameIdentifier), out int id))
            throw new UnauthorizedException("Token is missing the required claims.");

        return id;
    }
}

/// <summary>
/// What somebody chooses to show on their public card. The slug comes back on
/// a read so the screen can print the link; it is never accepted on a write —
/// choosing your own would let somebody claim a link they were told about.
/// </summary>
public record CardSettingsDto(bool on, bool show_places, bool show_money, string? slug = null);
