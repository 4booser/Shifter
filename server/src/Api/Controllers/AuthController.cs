using System.Security.Claims;
using MediatR;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using Shifter.Api.Extensions;
using Shifter.Application.Common.Exceptions;
using Shifter.Application.Common.Exceptions;
using Shifter.Application.Features.Auth.DTOs;
using Shifter.Application.Features.Auth.Services;
using Shifter.Application.Features.Auth.Services.Interfaces;

namespace Shifter.Api.Controllers;

// Authenticated by default: anything added here is protected unless it opts out
// with [AllowAnonymous], so a new endpoint cannot be left open by forgetting an
// attribute.
[Authorize]
// Credentials are guessable by definition, so this whole controller is held to
// the stricter limit rather than the one the rest of the API runs under.
[EnableRateLimiting(HardeningExtensions.AuthPolicy)]
[Route("shifter/v1/auth")]
public class AuthController : Controller
{
    private readonly IMediator _mediator;
    private readonly Shifter.Application.Features.Auth.Services.PasswordResetService _resets;
    private readonly IWebHostEnvironment _environment;

    public AuthController(
        IMediator mediator,
        Shifter.Application.Features.Auth.Services.PasswordResetService resets,
        IWebHostEnvironment environment)
    {
        _mediator = mediator;
        _resets = resets;
        _environment = environment;
    }

    /// <summary>
    /// Always 202, known address or not: an endpoint that says "no such
    /// account" is an endpoint that enumerates accounts. In development the
    /// token comes back in the body so the flow can be exercised without a
    /// mail provider; in production it lives only in the letter.
    /// </summary>
    [HttpPost]
    [AllowAnonymous]
    [Route("password/forgot")]
    public async Task<IActionResult> Forgot([FromBody] ForgotBody request, CancellationToken ct)
    {
        var token = await _resets.RequestAsync(request.email, _environment.IsDevelopment(), ct);

        return Accepted(token is null ? new { } : new { dev_token = token } as object);
    }

    [HttpPost]
    [AllowAnonymous]
    [Route("password/reset")]
    public async Task<IActionResult> Reset([FromBody] ResetBody request, CancellationToken ct)
    {
        await _resets.RedeemAsync(request.token, request.password, ct);

        return NoContent();
    }

    [HttpPost]
    [AllowAnonymous]
    [Route("user/register")]
    public async Task<ActionResult<AuthResponseDto>> Register(
        [FromBody] RegisterDto request,
        CancellationToken ct)
    {
        var result = await _mediator.Send(request, ct);

        return Ok(result);
    }

    [HttpPost]
    [AllowAnonymous]
    [Route("user/login")]
    public async Task<IActionResult> Login(
        [FromBody] LoginDto request,
        CancellationToken ct)
    {
        try
        {
            return Ok(await _mediator.Send(request, ct));
        }
        catch (TwoFactorRequiredException challenge)
        {
            // 200 on purpose: the password was right, and the client's next
            // move is a code, not an error banner.
            return Ok(new { two_factor_required = true, ticket = challenge.Ticket });
        }
    }

    /// <summary>The second half of a two-factor sign-in.</summary>
    [HttpPost]
    [AllowAnonymous]
    [Route("user/login/2fa")]
    public async Task<ActionResult<AuthResponseDto>> LoginSecondFactor(
        [FromBody] SecondFactorBody request,
        [FromServices] TwoFactorService twoFactor,
        [FromServices] IAuthTokenIssuer issuer,
        CancellationToken ct)
    {
        var (id, login) = await twoFactor.RedeemAsync(request.ticket, request.code.Trim(), ct);

        return Ok(await issuer.IssueAsync(id, login, ct));
    }

    public record SecondFactorBody(string ticket, string code);

    public record CodeBody(string code);

    // ==== Managing the second factor ====

    [HttpPost]
    [Microsoft.AspNetCore.Authorization.Authorize]
    [Route("2fa/setup")]
    public async Task<ActionResult> TwoFactorSetup(
        [FromServices] TwoFactorService twoFactor,
        CancellationToken ct)
    {
        var (secret, url) = await twoFactor.BeginAsync(AuthenticatedUserId(), ct);

        return Ok(new { secret, otpauth_url = url });
    }

    [HttpPost]
    [Microsoft.AspNetCore.Authorization.Authorize]
    [Route("2fa/enable")]
    public async Task<ActionResult> TwoFactorEnable(
        [FromBody] CodeBody request,
        [FromServices] TwoFactorService twoFactor,
        CancellationToken ct)
        => Ok(new { backup_codes = await twoFactor.EnableAsync(AuthenticatedUserId(), request.code.Trim(), ct) });

    [HttpPost]
    [Microsoft.AspNetCore.Authorization.Authorize]
    [Route("2fa/disable")]
    public async Task<ActionResult> TwoFactorDisable(
        [FromBody] CodeBody request,
        [FromServices] TwoFactorService twoFactor,
        CancellationToken ct)
    {
        await twoFactor.DisableAsync(AuthenticatedUserId(), request.code.Trim(), ct);

        return NoContent();
    }

    private int AuthenticatedUserId()
    {
        var id = User.FindFirstValue(System.Security.Claims.ClaimTypes.NameIdentifier);

        if (!int.TryParse(id, out var userId))
            throw new UnauthorizedException("Token is missing the required claims.");

        return userId;
    }

    /// <summary>
    /// Trades a refresh token for a new pair. Anonymous by design: it runs
    /// precisely when the access token has already expired.
    /// </summary>
    [HttpPost]
    [AllowAnonymous]
    [Route("refresh")]
    public async Task<ActionResult<AuthResponseDto>> Refresh(
        [FromBody] RefreshDto request,
        CancellationToken ct)
    {
        var result = await _mediator.Send(request, ct);

        return Ok(result);
    }

    /// <summary>
    /// One button for both cases: an unknown Google account is created, a known
    /// one is signed in. Anonymous, like the other entry points.
    /// </summary>
    [HttpPost]
    [AllowAnonymous]
    [Route("google")]
    public async Task<ActionResult<AuthResponseDto>> Google(
        [FromBody] GoogleSignInDto request,
        CancellationToken ct)
    {
        var result = await _mediator.Send(request, ct);

        return Ok(result);
    }

    /// <summary>
    /// Ends this session. Anonymous because it is the right thing to do with an
    /// access token that has already expired: the refresh token in the body is
    /// what identifies the session, and revoking it is never harmful.
    /// </summary>
    [HttpPost]
    [AllowAnonymous]
    [Route("logout")]
    public async Task<ActionResult<LogoutResultDto>> Logout(
        [FromBody] LogoutDto request,
        CancellationToken ct)
    {
        var result = await _mediator.Send(request, ct);

        return Ok(result);
    }

    /// <summary>Ends every session on every device. Requires a live token.</summary>
    [HttpPost]
    [Route("logout/all")]
    public async Task<ActionResult<LogoutResultDto>> LogoutEverywhere(CancellationToken ct)
    {
        var result = await _mediator.Send(new LogoutEverywhereDto(CurrentUserId()), ct);

        return Ok(result);
    }

    /// <summary>Lets the client know whether to render the Google button.</summary>
    [HttpGet]
    [AllowAnonymous]
    [Route("google/config")]
    public IActionResult GoogleConfig([FromServices] IConfiguration configuration)
        => Ok(new { client_id = configuration["Google:ClientId"] });

    [HttpGet]
    [Route("goal")]
    public async Task<IActionResult> GetGoal(
        [FromServices] Shifter.Infrastructure.Repositories.Interfaces.IUserQuery users,
        CancellationToken ct)
    {
        var user = await users.GetByIdAsync(CurrentUserId(), ct)
            ?? throw new UnauthorizedException("Token is missing the required claims.");

        return Ok(new { monthly_goal = user.MonthlyGoal });
    }

    public record GoalDto(decimal? monthly_goal);

    [HttpPut]
    [Route("goal")]
    public async Task<IActionResult> SetGoal(
        [FromBody] GoalDto request,
        [FromServices] Shifter.Infrastructure.Repositories.Interfaces.IUserCommand users,
        [FromServices] Shifter.Infrastructure.Repositories.Interfaces.IUserQuery query,
        CancellationToken ct)
    {
        if (request.monthly_goal < 0)
            throw new Shifter.Application.Common.Exceptions.ValidationException(
                "Goal cannot be negative.");

        await users.SetMonthlyGoalAsync(CurrentUserId(), request.monthly_goal, ct);

        return Ok(new { monthly_goal = request.monthly_goal });
    }

    /// <summary>
    /// The caller's id, straight from the token. Never taken from the body:
    /// that would let anyone edit anyone else's data by changing a number.
    /// </summary>
    private int CurrentUserId()
    {
        if (!int.TryParse(User.FindFirstValue(ClaimTypes.NameIdentifier), out int id))
            throw new UnauthorizedException("Token is missing the required claims.");

        return id;
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

public record ForgotBody(string? email);

public record ResetBody(string? token, string? password);
