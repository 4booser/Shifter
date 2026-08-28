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

    public AccountController(IMediator mediator)
        => _mediator = mediator;

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

    [HttpDelete]
    public async Task<IActionResult> Delete(
        [FromBody] DeleteAccountBody request,
        CancellationToken ct)
    {
        await _mediator.Send(
            new DeleteAccountDto(UserId(), request.password, request.confirm_login), ct);

        return NoContent();
    }

    private int UserId()
    {
        if (!int.TryParse(User.FindFirstValue(ClaimTypes.NameIdentifier), out int id))
            throw new UnauthorizedException("Token is missing the required claims.");

        return id;
    }
}

/// <summary>What somebody chooses to show on their public card.</summary>
public record CardSettingsDto(bool on, bool show_places, bool show_money);
