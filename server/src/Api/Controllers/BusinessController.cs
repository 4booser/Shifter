using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Shifter.Application.Common.Exceptions;
using Shifter.Application.Features.business.DTOs;
using Shifter.Application.Features.business.Services.Interfaces;

namespace Shifter.Api.Controllers;

// Authenticated by default, like AuthController. Nothing here opts out: every
// route works on the caller's own data.
[Authorize]
[Route("shifter/v1")]
public class BusinessController : ControllerBase
{
    private readonly IShiftHandler _shiftHandler;
    private readonly ISalesHandler _salesHandler;
    private readonly IDayHandler _dayHandler;
    private readonly IPayoutHandler _payoutHandler;
    private readonly ILocationHandler _locationHandler;
    private readonly IEventHandler _eventHandler;

    public BusinessController(
        IShiftHandler shiftHandler,
        ISalesHandler salesHandler,
        IDayHandler dayHandler,
        IPayoutHandler payoutHandler,
        ILocationHandler locationHandler,
        IEventHandler eventHandler)
    {
        _shiftHandler = shiftHandler;
        _salesHandler = salesHandler;
        _dayHandler = dayHandler;
        _payoutHandler = payoutHandler;
        _locationHandler = locationHandler;
        _eventHandler = eventHandler;
    }

    [HttpGet]
    [Route("locations")]
    public async Task<ActionResult<LocationDto[]>> GetLocations(
        [FromQuery] bool archived,
        CancellationToken ct)
        => Ok(await _locationHandler.ListAsync(CurrentUserId(), archived, ct));

    [HttpPost]
    [Route("locations")]
    public async Task<ActionResult<LocationDto>> CreateLocation(
        [FromBody] LocationCreateDto request,
        CancellationToken ct)
        => Ok(await _locationHandler.CreateAsync(request, CurrentUserId(), ct));

    [HttpPut]
    [Route("locations/{id:int}")]
    public async Task<ActionResult<LocationDto>> UpdateLocation(
        int id,
        [FromBody] LocationCreateDto request,
        CancellationToken ct)
        => Ok(await _locationHandler.UpdateAsync(request, CurrentUserId(), id, ct));

    [HttpPost]
    [Route("locations/{id:int}/archived")]
    public async Task<ActionResult<LocationDto>> ArchiveLocation(
        int id,
        [FromQuery] bool value,
        CancellationToken ct)
        => Ok(await _locationHandler.SetArchivedAsync(CurrentUserId(), id, value, ct));

    [HttpDelete]
    [Route("locations/{id:int}")]
    public async Task<IActionResult> DeleteLocation(int id, CancellationToken ct)
    {
        await _locationHandler.DeleteAsync(CurrentUserId(), id, ct);

        return NoContent();
    }

    [HttpDelete]
    [Route("sales/{id:int}")]
    public async Task<IActionResult> DeleteSales(int id, CancellationToken ct)
    {
        await _salesHandler.DeleteAsync(CurrentUserId(), id, ct);

        return NoContent();
    }

    /// <summary>
    /// When money is due, from whom, and whether it arrived in full. Each
    /// place has its own cycle, so this is the only view where "am I being
    /// paid correctly" is answerable at a glance.
    /// </summary>
    [HttpGet]
    [Route("payouts/schedule")]
    public async Task<ActionResult<ReconciliationDto>> PayoutSchedule(
        [FromServices] IReconciliationHandler reconciliation,
        [FromQuery] DateOnly from,
        [FromQuery] DateOnly to,
        CancellationToken ct)
        => Ok(await reconciliation.BuildAsync(CurrentUserId(), from, to, ct));

    [HttpGet]
    [Route("payouts")]
    public async Task<ActionResult<PayoutDto[]>> GetPayouts(
        [FromQuery] DateOnly from,
        [FromQuery] DateOnly to,
        CancellationToken ct)
        => Ok(await _payoutHandler.ListAsync(CurrentUserId(), from, to, ct));

    [HttpPost]
    [Route("payouts")]
    public async Task<ActionResult<PayoutDto>> CreatePayout(
        [FromBody] PayoutCreateDto request,
        CancellationToken ct)
        => Ok(await _payoutHandler.CreateAsync(request, CurrentUserId(), ct));

    [HttpDelete]
    [Route("payouts/{id:int}")]
    public async Task<IActionResult> DeletePayout(int id, CancellationToken ct)
    {
        await _payoutHandler.DeleteAsync(CurrentUserId(), id, ct);

        return NoContent();
    }

    [HttpGet]
    [Route("shifts")]
    public async Task<ActionResult<ShiftDto[]>> GetShifts(
        [FromQuery] bool archived,
        CancellationToken ct)
        => Ok(await _shiftHandler.ListAsync(CurrentUserId(), archived, ct));

    [HttpPost]
    [Route("shifts")]
    public async Task<ActionResult<ShiftDto>> CreateShift(
        [FromBody] ShiftCreateDto request,
        CancellationToken ct)
        => Ok(await _shiftHandler.CreateAsync(request, CurrentUserId(), ct));

    [HttpPut]
    [Route("shifts/{id:int}")]
    public async Task<ActionResult<ShiftDto>> UpdateShift(
        int id,
        [FromBody] ShiftCreateDto request,
        CancellationToken ct)
        => Ok(await _shiftHandler.UpdateAsync(request, CurrentUserId(), id, ct));

    /// <summary>
    /// Archiving rather than deleting: the days a template sits on keep their
    /// history, and a mistake can be undone by restoring it.
    /// </summary>
    [HttpPost]
    [Route("shifts/{id:int}/archived")]
    public async Task<ActionResult<ShiftDto>> ArchiveShift(
        int id,
        [FromQuery] bool value,
        CancellationToken ct)
        => Ok(await _shiftHandler.SetArchivedAsync(CurrentUserId(), id, value, ct));

    [HttpGet]
    [Route("sales")]
    public async Task<ActionResult<SalesDto[]>> GetSales(
        [FromQuery] bool archived,
        CancellationToken ct)
        => Ok(await _salesHandler.ListAsync(CurrentUserId(), archived, ct));

    [HttpPost]
    [Route("sales")]
    public async Task<ActionResult<SalesDto>> CreateSales(
        [FromBody] SalesCreateDto request,
        CancellationToken ct)
        => Ok(await _salesHandler.CreateAsync(request, CurrentUserId(), ct));

    [HttpPut]
    [Route("sales/{id:int}")]
    public async Task<ActionResult<SalesDto>> UpdateSales(
        int id,
        [FromBody] SalesCreateDto request,
        CancellationToken ct)
        => Ok(await _salesHandler.UpdateAsync(request, CurrentUserId(), id, ct));

    [HttpPost]
    [Route("sales/{id:int}/archived")]
    public async Task<ActionResult<SalesDto>> ArchiveSales(
        int id,
        [FromQuery] bool value,
        CancellationToken ct)
        => Ok(await _salesHandler.SetArchivedAsync(CurrentUserId(), id, value, ct));

    [HttpGet]
    [Route("days")]
    public async Task<ActionResult<DaysDto>> GetDays(
        [FromQuery] DateOnly from,
        [FromQuery] DateOnly to,
        CancellationToken ct)
        => Ok(await _dayHandler.ListAsync(CurrentUserId(), from, to, ct));

    /// <summary>
    /// Applies one template across many dates at once, for dragging over the
    /// calendar and for generating a rota.
    /// </summary>
    [HttpPost]
    [Route("days/bulk")]
    public async Task<ActionResult<DayDto[]>> BulkDays(
        [FromBody] BulkShiftDto request,
        CancellationToken ct)
        => Ok(await _dayHandler.BulkAsync(request, CurrentUserId(), ct));

    /// <summary>
    /// Upsert: the date in the route identifies the day, and the body carries
    /// its full contents, so repeating the call is safe.
    /// </summary>
    [HttpPut]
    [Route("days/{date}")]
    public async Task<ActionResult<DayDto>> SaveDay(
        DateOnly date,
        [FromBody] DaySaveDto request,
        CancellationToken ct)
        => Ok(await _dayHandler.SaveAsync(request, CurrentUserId(), date, ct));

    /// <summary>
    /// Everything overlapping the range, so a fortnight of leave that began
    /// last month still reaches the calendar showing this one.
    /// </summary>
    [HttpGet]
    [Route("events")]
    public async Task<ActionResult<EventDto[]>> GetEvents(
        [FromQuery] DateOnly from,
        [FromQuery] DateOnly to,
        CancellationToken ct)
        => Ok(await _eventHandler.ListAsync(CurrentUserId(), from, to, ct));

    [HttpPost]
    [Route("events")]
    public async Task<ActionResult<EventDto>> CreateEvent(
        [FromBody] EventSaveDto request,
        CancellationToken ct)
        => Ok(await _eventHandler.CreateAsync(request, CurrentUserId(), ct));

    [HttpPut]
    [Route("events/{id:int}")]
    public async Task<ActionResult<EventDto>> UpdateEvent(
        int id,
        [FromBody] EventSaveDto request,
        CancellationToken ct)
        => Ok(await _eventHandler.UpdateAsync(request, CurrentUserId(), id, ct));

    [HttpDelete]
    [Route("events/{id:int}")]
    public async Task<IActionResult> DeleteEvent(int id, CancellationToken ct)
    {
        await _eventHandler.DeleteAsync(CurrentUserId(), id, ct);

        return NoContent();
    }

    /// <summary>
    /// Read from the token, never from the request. A user id in the body or
    /// query would let any signed-in caller act as somebody else.
    /// </summary>
    private int CurrentUserId()
    {
        var id = User.FindFirstValue(ClaimTypes.NameIdentifier);

        if (!int.TryParse(id, out var userId))
            throw new UnauthorizedException("Token is missing the required claims.");

        return userId;
    }
}
