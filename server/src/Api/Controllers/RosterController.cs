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

    /// <summary>Days with no set time only with bare=1: a build from before them reads a null time and falls over.</summary>
    [HttpGet("{id:int}/month/{month}")]
    public async Task<ActionResult<RosterMonthDto>> Month(
        int id, string month, [FromQuery(Name = "bare")] string? bare, CancellationToken ct)
        => Ok(await _rosters.MonthAsync(id, UserId(), month, bare == "1", ct));

    /// <summary>The venue's open weekdays, the whole list at once.</summary>
    [HttpPut("{id:int}/venue-hours")]
    public async Task<ActionResult<RosterVenueSavedDto>> VenueHours(
        int id, [FromBody] RosterVenueSaveDto? request, CancellationToken ct)
        => Ok(await _rosters.SaveVenueHoursAsync(id, UserId(), request, ct));

    [HttpPost("{id:int}/positions")]
    public async Task<ActionResult<RosterPositionDto>> AddPosition(
        int id, [FromBody] RosterPositionSaveDto? request, CancellationToken ct)
        => Ok(await _rosters.AddPositionAsync(id, UserId(), request, ct));

    [HttpPut("{id:int}/positions/{positionId:int}")]
    public async Task<ActionResult<RosterPositionSavedDto>> UpdatePosition(
        int id, int positionId, [FromBody] RosterPositionSaveDto? request, CancellationToken ct)
        => Ok(await _rosters.UpdatePositionAsync(id, UserId(), positionId, request, ct));

    /// <summary>The people on it stay, with no position.</summary>
    [HttpDelete("{id:int}/positions/{positionId:int}")]
    public async Task<ActionResult<RosterRestampedDto>> DeletePosition(int id, int positionId, CancellationToken ct)
        => Ok(await _rosters.DeletePositionAsync(id, UserId(), positionId, ct));

    [HttpPost("{id:int}/people")]
    public async Task<ActionResult<RosterPersonDto>> AddPerson(
        int id, [FromBody] RosterPersonSaveDto? request, CancellationToken ct)
        => Ok(await _rosters.AddPersonAsync(id, UserId(), request, ct));

    [HttpPut("{id:int}/people/{personId:int}")]
    public async Task<ActionResult<RosterPersonSavedDto>> UpdatePerson(
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

    /// <summary>Puts everybody on their usual days, from the owner's today in the month being lived through.</summary>
    [HttpPost("{id:int}/fill")]
    public async Task<ActionResult<RosterFilledDto>> Fill(
        int id, [FromBody] RosterFillDto? request, CancellationToken ct)
        => Ok(await _rosters.FillAsync(id, UserId(), request, ct));

    /// <summary>Empties a month from the owner's today on, so a fill can start over.</summary>
    [HttpPost("{id:int}/clear")]
    public async Task<ActionResult<RosterClearedDto>> Clear(
        int id, [FromBody] RosterFillDto? request, CancellationToken ct)
        => Ok(await _rosters.ClearAsync(id, UserId(), request, ct));

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
