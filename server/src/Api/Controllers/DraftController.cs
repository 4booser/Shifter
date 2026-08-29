using System.Security.Claims;

using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

using Shifter.Application.Features.business.Services;

namespace Shifter.Api.Controllers;

/// <summary>
/// Prices a hypothetical set of shifts and writes nothing.
///
/// The client cannot do this honestly: the fifth shift of a week is priced by
/// the four real ones already in it, and only the server holds both halves.
/// </summary>
[Authorize]
[Route("shifter/v1/days/price")]
public class DraftController : ControllerBase
{
    private readonly DraftPricer _pricer;

    public DraftController(DraftPricer pricer) => _pricer = pricer;

    public record DraftDto(int shift_id, string[] dates);

    [HttpPost]
    public async Task<IActionResult> Price([FromBody] DraftDto request, CancellationToken ct)
    {
        var dates = (request.dates ?? [])
            .Select(text => DateOnly.TryParse(text, out var date) ? date : (DateOnly?)null)
            .Where(date => date is not null)
            .Select(date => date!.Value)
            .Distinct()
            .ToArray();

        var priced = await _pricer.PriceAsync(UserId(), request.shift_id, dates, ct);

        return Ok(new
        {
            base_pay = priced.Base,
            hours = priced.Hours,
            overtime_extra = priced.OvertimeExtra,
            overtime_hours = priced.OvertimeHours,
            total = priced.Total,
        });
    }

    private int UserId() => int.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);
}
