using System.Security.Claims;
using MediatR;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Shifter.Application.Common.Exceptions;
using Shifter.Application.Features.Teams.DTOs;

namespace Shifter.Api.Controllers;

/// <summary>
/// The shared rota. Everything here shows who is on and for how long; nothing
/// here can show what anyone earns. The DTOs have no money fields at all, and
/// the query behind them never reads a pay column.
/// </summary>
[Authorize]
[Route("shifter/v1/teams")]
public class TeamsController : Controller
{
    private readonly IMediator _mediator;

    public TeamsController(IMediator mediator)
        => _mediator = mediator;

    [HttpGet]
    public async Task<ActionResult<TeamDto[]>> List(CancellationToken ct)
        => Ok(await _mediator.Send(new ListTeamsDto(UserId()), ct));

    [HttpPost]
    public async Task<ActionResult<TeamDto>> Create(
        [FromBody] CreateTeamBody request,
        CancellationToken ct)
        => Ok(await _mediator.Send(new CreateTeamDto(UserId(), request.name), ct));

    [HttpPost]
    [Route("join")]
    public async Task<ActionResult<TeamDto>> Join(
        [FromBody] JoinTeamBody request,
        CancellationToken ct)
        => Ok(await _mediator.Send(
            new JoinTeamDto(UserId(), request.invite_code, request.display_name), ct));

    /// <summary>Leaves the team, or deletes it when the owner is the one leaving.</summary>
    [HttpDelete]
    [Route("{id:int}/me")]
    public async Task<IActionResult> Leave(int id, CancellationToken ct)
    {
        await _mediator.Send(new LeaveTeamDto(UserId(), id), ct);

        return NoContent();
    }

    /// <summary>Issues a new invite code; the old one stops working at once.</summary>
    [HttpPost]
    [Route("{id:int}/code")]
    public async Task<ActionResult<TeamDto>> RotateCode(int id, CancellationToken ct)
        => Ok(await _mediator.Send(new RotateCodeDto(UserId(), id), ct));

    [HttpGet]
    [Route("{id:int}/rota")]
    public async Task<ActionResult<RotaDto>> Rota(
        int id,
        [FromQuery] DateOnly from,
        [FromQuery] DateOnly to,
        CancellationToken ct)
        => Ok(await _mediator.Send(new GetRotaDto(UserId(), id, from, to), ct));

    private int UserId()
    {
        if (!int.TryParse(User.FindFirstValue(ClaimTypes.NameIdentifier), out int id))
            throw new UnauthorizedException("Token is missing the required claims.");

        return id;
    }
}
