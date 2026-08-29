using System.Security.Claims;

using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;

using Shifter.Api.Extensions;
using Shifter.Application.Common.Exceptions;
using Shifter.Application.Features.Health;

namespace Shifter.Api.Controllers;

/// <summary>The record's own health: what is unfilled and what it costs.</summary>
[Authorize]
[Route("shifter/v1/health/records")]
[EnableRateLimiting(HardeningExtensions.ApiPolicy)]
public class HealthRecordsController : ControllerBase
{
    private readonly RecordsHealthService _health;

    public HealthRecordsController(RecordsHealthService health) => _health = health;

    [HttpGet]
    public async Task<IActionResult> Read(CancellationToken ct)
        => Ok((await _health.ReadAsync(
                UserId(), DateOnly.FromDateTime(DateTime.UtcNow), ct))
            .Select(gap => new
            {
                kind = gap.Kind,
                count = gap.Count,
                sample = gap.Sample,
                hurts = gap.Hurts,
            }));

    private int UserId()
    {
        var id = User.FindFirstValue(ClaimTypes.NameIdentifier);

        if (!int.TryParse(id, out var userId))
            throw new UnauthorizedException("Token is missing the required claims.");

        return userId;
    }
}
