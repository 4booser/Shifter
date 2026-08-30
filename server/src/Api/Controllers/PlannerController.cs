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

    /// <summary>The day's cast: who can be asked, who stands, who said no.</summary>
    [HttpGet("who")]
    public async Task<IActionResult> Who(
        int teamId, [FromQuery] DateOnly date, CancellationToken ct)
    {
        var read = await _planner.WhoAsync(teamId, UserId(), date, ct);

        object Rows(IEnumerable<Application.Features.Teams.Services.PlannerService.WhoRow> rows)
            => rows.Select(row => new
            {
                user_id = row.UserId,
                name = row.Name,
                colour = row.Colour,
                detail = row.Detail,
                trainee = row.Trainee,
            });

        return Ok(new { free = Rows(read.Free), busy = Rows(read.Busy), away = Rows(read.Away) });
    }

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

    /// <summary>
    /// Hands one slot out to whoever can take it. Drafts, always — a rota is
    /// argued about, so this fills a board a manager then corrects.
    /// </summary>
    [HttpPost("fill")]
    public async Task<ActionResult<FillResultDto>> Fill(
        int teamId, [FromBody] FillSlotDto request, CancellationToken ct)
        => Ok(await _planner.FillAsync(teamId, UserId(), request, ct));

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

    // ==== The pool ====

    /// <summary>
    /// The night's tip pool and how it divides. Everybody who worked the shift
    /// sees every share — that is not a hole in the privacy rules, it is the
    /// exact transparency a pool exists for.
    /// </summary>
    [HttpGet("pool")]
    public async Task<ActionResult<PoolDto>> Pool(
        int teamId, [FromQuery] DateOnly date, CancellationToken ct)
        => Ok(await _planner.PoolAsync(teamId, UserId(), date, ct));

    /// <summary>
    /// Entering it. Anybody in the crew may: whoever counted the tin is
    /// whoever counted it.
    /// </summary>
    [HttpPost("pool")]
    public async Task<ActionResult<PoolDto>> SavePool(
        int teamId, [FromBody] PoolSaveDto request, CancellationToken ct)
        => Ok(await _planner.SavePoolAsync(teamId, UserId(), request, ct));

    // ==== The handover ====

    /// <summary>
    /// What the shift going home knows and the shift coming in does not: one
    /// note for the day, and everything the room is currently missing.
    /// </summary>
    [HttpGet("handover")]
    public async Task<IActionResult> Handover(
        int teamId, [FromQuery] DateOnly date, CancellationToken ct)
    {
        var (note, stops) = await _planner.HandoverAsync(teamId, UserId(), date, ct);

        return Ok(new { note, stops });
    }

    /// <summary>
    /// Anybody in the crew may write it. The person who knows the grinder is
    /// broken is whoever was standing next to it.
    /// </summary>
    [HttpPost("handover")]
    public async Task<ActionResult<HandoverDto>> WriteHandover(
        int teamId, [FromBody] HandoverSaveDto request, CancellationToken ct)
        => Ok(await _planner.WriteHandoverAsync(teamId, UserId(), request, ct));

    [HttpPost("handover/stops")]
    public async Task<ActionResult<StopItemDto[]>> RaiseStop(
        int teamId, [FromBody] StopItemSaveDto request, CancellationToken ct)
        => Ok(await _planner.RaiseStopAsync(teamId, UserId(), request, ct));

    /// <summary>It came back, or it was fixed.</summary>
    [HttpDelete("handover/stops/{id:int}")]
    public async Task<ActionResult<StopItemDto[]>> ClearStop(
        int teamId, int id, CancellationToken ct)
        => Ok(await _planner.ClearStopAsync(teamId, UserId(), id, ct));

    // ==== Leave ====

    /// <summary>
    /// A planner sees the crew's requests; everybody else sees their own.
    /// </summary>
    [HttpGet("leave")]
    public async Task<ActionResult<LeaveDto[]>> Leave(int teamId, CancellationToken ct)
        => Ok(await _planner.LeaveAsync(teamId, UserId(), ct));

    [HttpPost("leave")]
    public async Task<ActionResult<LeaveDto[]>> RequestLeave(
        int teamId, [FromBody] LeaveSaveDto request, CancellationToken ct)
        => Ok(await _planner.RequestLeaveAsync(teamId, UserId(), request, ct));

    /// <summary>Approving or declining. Never your own.</summary>
    [HttpPost("leave/{id:int}/decision")]
    public async Task<ActionResult<LeaveDto[]>> DecideLeave(
        int teamId, int id, [FromBody] LeaveDecisionDto request, CancellationToken ct)
        => Ok(await _planner.DecideLeaveAsync(teamId, UserId(), id, request, ct));

    /// <summary>Taking it back — plans change, and so do holidays.</summary>
    [HttpDelete("leave/{id:int}")]
    public async Task<ActionResult<LeaveDto[]>> WithdrawLeave(
        int teamId, int id, CancellationToken ct)
        => Ok(await _planner.WithdrawLeaveAsync(teamId, UserId(), id, ct));

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
