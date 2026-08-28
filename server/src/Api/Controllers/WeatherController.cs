using System.Security.Claims;

using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

using Shifter.Application.Features.Weather;

namespace Shifter.Api.Controllers;

/// <summary>
/// Somebody's own record read against the sky over their own place.
/// </summary>
[Authorize]
[Route("shifter/v1/weather")]
public class WeatherController : ControllerBase
{
    private readonly WeatherService _weather;

    public WeatherController(WeatherService weather) => _weather = weather;

    [HttpGet("effect")]
    public async Task<IActionResult> Effect([FromQuery] DateOnly? today, CancellationToken ct)
    {
        var readings = await _weather.ReadAsync(
            UserId(), today ?? DateOnly.FromDateTime(DateTime.UtcNow), ct);

        return Ok(new
        {
            places = readings.Select(reading => new
            {
                location_id = reading.LocationId,
                place = reading.Place,
                wet_days = reading.Verdict.WetDays,
                dry_days = reading.Verdict.DryDays,
                wet_per_hour = reading.Verdict.WetPerHour,
                dry_per_hour = reading.Verdict.DryPerHour,
                percent = reading.Verdict.Percent,
                // The client is told whether the gap is big enough to say out
                // loud, rather than left to invent its own threshold and
                // disagree with every other screen about what counts.
                worth = reading.Verdict.Worth,
            }),
        });
    }

    private int UserId() => int.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);
}
