using System.Security.Claims;

using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

using Shifter.Application.Common.Exceptions;
using Shifter.Application.Features.Rosters;

namespace Shifter.Api.Controllers;

/// <summary>A roster over HTTP, for the one person who writes it.</summary>
[Authorize]
[Route("shifter/v1/rosters")]
public class RosterController : ControllerBase
{
    private readonly RosterService _rosters;

    public RosterController(RosterService rosters) => _rosters = rosters;

    [HttpGet]
    public async Task<ActionResult<RosterDto[]>> List(CancellationToken ct)
        => Ok(await _rosters.ListAsync(UserId(), ct));

    [HttpPost]
    public async Task<ActionResult<RosterDto>> Create([FromBody] RosterSaveDto? request, CancellationToken ct)
        => Ok(await _rosters.CreateAsync(UserId(), request, ct));

    [HttpPut("{id:int}")]
    public async Task<ActionResult<RosterDto>> Rename(int id, [FromBody] RosterSaveDto? request, CancellationToken ct)
        => Ok(await _rosters.RenameAsync(id, UserId(), request, ct));

    [HttpDelete("{id:int}")]
    public async Task<ActionResult> Delete(int id, CancellationToken ct)
    {
        await _rosters.DeleteAsync(id, UserId(), ct);

        return NoContent();
    }

    [HttpGet("{id:int}/month/{month}")]
    public async Task<ActionResult<RosterMonthDto>> Month(int id, string month, CancellationToken ct)
        => Ok(await _rosters.MonthAsync(id, UserId(), month, ct));

    [HttpPost("{id:int}/people")]
    public async Task<ActionResult<RosterPersonDto>> AddPerson(
        int id, [FromBody] RosterPersonSaveDto? request, CancellationToken ct)
        => Ok(await _rosters.AddPersonAsync(id, UserId(), request, ct));

    [HttpPut("{id:int}/people/{personId:int}")]
    public async Task<ActionResult<RosterPersonDto>> UpdatePerson(
        int id, int personId, [FromBody] RosterPersonSaveDto? request, CancellationToken ct)
        => Ok(await _rosters.UpdatePersonAsync(id, UserId(), personId, request, ct));

    [HttpDelete("{id:int}/people/{personId:int}")]
    public async Task<ActionResult> DeletePerson(int id, int personId, CancellationToken ct)
    {
        await _rosters.DeletePersonAsync(id, UserId(), personId, ct);

        return NoContent();
    }

    /// <summary>A batch of cells, all of it or none.</summary>
    [HttpPut("{id:int}/cells")]
    public async Task<ActionResult> Cells(int id, [FromBody] RosterCellsDto? request, CancellationToken ct)
    {
        await _rosters.SaveCellsAsync(id, UserId(), request, ct);

        return NoContent();
    }

    /// <summary>Fills a month from the one before it.</summary>
    [HttpPost("{id:int}/repeat")]
    public async Task<ActionResult<RosterRepeatedDto>> Repeat(
        int id, [FromBody] RosterRepeatDto? request, CancellationToken ct)
        => Ok(await _rosters.RepeatAsync(id, UserId(), request, ct));

    /// <summary>Turns the link on, or replaces it, which kills the old one at once.</summary>
    [HttpPost("{id:int}/share")]
    public async Task<ActionResult<RosterShareDto>> Share(int id, CancellationToken ct)
        => Ok(await _rosters.ShareAsync(id, UserId(), ct));

    [HttpDelete("{id:int}/share")]
    public async Task<ActionResult> Unshare(int id, CancellationToken ct)
    {
        await _rosters.UnshareAsync(id, UserId(), ct);

        return NoContent();
    }

    private int UserId()
    {
        var id = User.FindFirstValue(ClaimTypes.NameIdentifier);

        if (!int.TryParse(id, out var userId))
            throw new UnauthorizedException("Token is missing the required claims.");

        return userId;
    }
}
