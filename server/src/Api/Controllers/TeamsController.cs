using System.Security.Claims;
using MediatR;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Shifter.Application.Common.Exceptions;
using Shifter.Application.Features.Teams.DTOs;

namespace Shifter.Api.Controllers;

/// <summary>
/// The shared rota: who is on and for how long.
///
/// What anyone earns is theirs to publish. It reaches the rota only for members
/// who have switched sharing on, and for the rest the query does not read the
/// pay column at all — see <see cref="Shifter.Application.Features.Teams.DTOs.RotaEntryDto"/>.
/// Tips, sales and rates are never read for anyone.
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

    /// <summary>
    /// How you appear to this crew and what you let them see. Your own only —
    /// there is no route to anybody else's, by design.
    /// </summary>
    [HttpPatch]
    [Route("{id:int}/me")]
    public async Task<ActionResult<MembershipDto>> UpdateMembership(
        int id,
        [FromBody] MembershipBody request,
        CancellationToken ct)
        => Ok(await _mediator.Send(
            new UpdateMembershipDto(
                UserId(),
                id,
                request.display_name,
                request.colour,
                request.share_earnings,
                request.private_by_default),
            ct));

    /// <summary>
    /// Whether one shift of yours shows on the rota. Null puts it back under
    /// your default. Not scoped to a team: hiding a shift hides it everywhere.
    /// </summary>
    [HttpPut]
    [Route("shifts/{dayShiftId:int}/visibility")]
    public async Task<IActionResult> SetVisibility(
        int dayShiftId,
        [FromBody] VisibilityBody request,
        CancellationToken ct)
    {
        await _mediator.Send(new SetShiftVisibilityDto(UserId(), dayShiftId, request.visible), ct);

        return NoContent();
    }

    /// <summary>Offering to take a shift somebody has asked to have covered.</summary>
    [HttpPost]
    [Route("{id:int}/cover/{dayShiftId:int}")]
    public async Task<ActionResult<RotaOfferDto>> OfferCover(
        int id,
        int dayShiftId,
        CancellationToken ct)
        => Ok(await _mediator.Send(new OfferCoverDto(UserId(), id, dayShiftId), ct));

    [HttpDelete]
    [Route("{id:int}/cover/offers/{offerId:int}")]
    public async Task<IActionResult> WithdrawCover(int id, int offerId, CancellationToken ct)
    {
        await _mediator.Send(new WithdrawCoverDto(UserId(), id, offerId), ct);

        return NoContent();
    }

    /// <summary>
    /// Handing the shift over. Only its owner may, and it leaves their calendar
    /// as a result — the person taking it places it on their own.
    /// </summary>
    [HttpPost]
    [Route("{id:int}/cover/offers/{offerId:int}/accept")]
    public async Task<ActionResult<AcceptedCoverDto>> AcceptCover(
        int id,
        int offerId,
        CancellationToken ct)
        => Ok(await _mediator.Send(new AcceptCoverDto(UserId(), id, offerId), ct));

    private int UserId()
    {
        if (!int.TryParse(User.FindFirstValue(ClaimTypes.NameIdentifier), out int id))
            throw new UnauthorizedException("Token is missing the required claims.");

        return id;
    }
}
