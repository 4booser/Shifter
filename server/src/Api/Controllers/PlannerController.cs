using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Shifter.Application.Common.Exceptions;
using Shifter.Application.Features.Teams.DTOs;
using Shifter.Application.Features.Teams.Services;

namespace Shifter.Api.Controllers;

/// <summary>
/// The manager's board over HTTP. Reads are open to any member (drafts are
/// filtered inside); writes check the caller's right per call, because the
/// service is where the rules live.
/// </summary>
[Authorize]
[Route("shifter/v1/teams/{teamId:int}/planner")]
public class PlannerController : ControllerBase
{
    private readonly PlannerService _planner;

    public PlannerController(PlannerService planner) => _planner = planner;

    [HttpGet]
    public async Task<ActionResult<PlannerBoardDto>> Board(
        int teamId,
        [FromQuery] DateOnly from,
        [FromQuery] DateOnly to,
        CancellationToken ct)
        => Ok(await _planner.BoardAsync(teamId, UserId(), from, to, ct));

    [HttpPost("assignments")]
    public async Task<ActionResult<AssignmentDto>> Create(
        int teamId, [FromBody] AssignmentSaveDto request, CancellationToken ct)
        => Ok(await _planner.SaveAsync(teamId, UserId(), null, request, ct));

    [HttpPut("assignments/{id:int}")]
    public async Task<ActionResult<AssignmentDto>> Update(
        int teamId, int id, [FromBody] AssignmentSaveDto request, CancellationToken ct)
        => Ok(await _planner.SaveAsync(teamId, UserId(), id, request, ct));

    [HttpDelete("assignments/{id:int}")]
    public async Task<ActionResult> Delete(int teamId, int id, CancellationToken ct)
    {
        await _planner.DeleteAsync(teamId, UserId(), id, ct);

        return NoContent();
    }

    [HttpPost("publish")]
    public async Task<ActionResult<PublishResultDto>> Publish(
        int teamId,
        [FromQuery] DateOnly from,
        [FromQuery] DateOnly to,
        CancellationToken ct)
        => Ok(await _planner.PublishAsync(teamId, UserId(), from, to, ct));

    [HttpPost("copy-week")]
    public async Task<IActionResult> CopyWeek(
        int teamId, [FromQuery(Name = "week_start")] DateOnly weekStart, CancellationToken ct)
        => Ok(await _planner.CopyWeekAsync(teamId, UserId(), weekStart, ct));

    [HttpGet("availability")]
    public async Task<IActionResult> Availability(
        int teamId, [FromQuery] DateOnly from, [FromQuery] DateOnly to, CancellationToken ct)
        => Ok(await _planner.AvailabilityAsync(teamId, UserId(), from, to, ct));

    /// <summary>Blocks a day, or lifts the block when it is already there.</summary>
    [HttpPost("availability")]
    public async Task<IActionResult> ToggleAvailability(
        int teamId, [FromBody] AvailabilitySaveDto request, CancellationToken ct)
        => Ok(await _planner.ToggleAvailabilityAsync(teamId, UserId(), request, ct));

    [HttpGet("mine")]
    public async Task<ActionResult<AssignmentDto[]>> Mine(int teamId, CancellationToken ct)
        => Ok(await _planner.MineAsync(teamId, UserId(), ct));

    [HttpPost("assignments/{id:int}/accept")]
    public async Task<ActionResult<AssignmentDto>> Accept(
        int teamId, int id, [FromBody] AcceptAssignmentDto request, CancellationToken ct)
        => Ok(await _planner.AcceptAsync(teamId, UserId(), id, request.template_id, ct));

    [HttpPost("assignments/{id:int}/decline")]
    public async Task<ActionResult<AssignmentDto>> Decline(int teamId, int id, CancellationToken ct)
        => Ok(await _planner.DeclineAsync(teamId, UserId(), id, ct));

    [HttpPut("members/{memberUserId:int}/manager")]
    public async Task<ActionResult> SetManager(
        int teamId, int memberUserId, [FromBody] SetManagerBody request, CancellationToken ct)
    {
        await _planner.SetManagerAsync(teamId, UserId(), memberUserId, request.is_manager, ct);

        return NoContent();
    }

    public record SetManagerBody(bool is_manager);

    private int UserId()
    {
        var id = User.FindFirstValue(ClaimTypes.NameIdentifier);

        if (!int.TryParse(id, out var userId))
            throw new UnauthorizedException("Token is missing the required claims.");

        return userId;
    }
}
