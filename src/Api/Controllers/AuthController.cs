using System.Security.Claims;
using MediatR;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Shifter.Application.Common.Exceptions;
using Shifter.Application.Features.Auth.DTOs;

namespace Shifter.Api.Controllers;

// Authenticated by default: anything added here is protected unless it opts out
// with [AllowAnonymous], so a new endpoint cannot be left open by forgetting an
// attribute.
[Authorize]
[Route("shifter/v1/auth")]
public class AuthController : Controller
{
    private readonly IMediator _mediator;

    public AuthController(IMediator mediator)
        => _mediator = mediator;

    [HttpPost]
    [AllowAnonymous]
    [Route("user/register")]
    public async Task<ActionResult<AuthResponseDTO>> Register(
        [FromBody] RegisterDTO request,
        CancellationToken ct)
    {
        var result = await _mediator.Send(request, ct);

        return Ok(result);
    }

    [HttpPost]
    [AllowAnonymous]
    [Route("user/login")]
    public async Task<ActionResult<AuthResponseDTO>> Login(
        [FromBody] LoginDTO request,
        CancellationToken ct)
    {
        var result = await _mediator.Send(request, ct);

        return Ok(result);
    }

    /// <summary>Returns the identity carried by the bearer token.</summary>
    [HttpGet]
    [Route("me")]
    public IActionResult Me()
    {
        var id = User.FindFirstValue(ClaimTypes.NameIdentifier);
        var login = User.FindFirstValue(ClaimTypes.Name);

        if (!int.TryParse(id, out var userId) || string.IsNullOrWhiteSpace(login))
            throw new UnauthorizedException("Token is missing the required claims.");

        return Ok(new { id = userId, login });
    }
}
