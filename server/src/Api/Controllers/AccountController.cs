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

/// <summary>The account itself, as opposed to signing in and out.</summary>
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

    /// <summary>Attaches a Google account to this one.</summary>
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

    /// <summary>What the public card shows, and whether there is one at all.</summary>
    [HttpGet]
    [Route("card")]
    public async Task<ActionResult<CardSettingsDto>> GetCard(CancellationToken ct)
    {
        User user = await Me(ct);

        return Ok(new CardSettingsDto(
            user.CardSlug is not null, user.CardShowsPlaces, user.CardShowsMoney, user.CardSlug));
    }

    /// <summary>Switches the card on or off and decides what it shows.</summary>
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

/// <summary>What somebody chooses to show on their public card.</summary>
public record CardSettingsDto(bool on, bool show_places, bool show_money, string? slug = null);
