using System.Security.Claims;

using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;

using Shifter.Api.Extensions;
using Shifter.Application.Common.Exceptions;
using Shifter.Application.Features.Papers;

namespace Shifter.Api.Controllers;

/// <summary>
/// "Download everything": the route every client already knows, serving the
/// takeout archive. There used to be a second, thinner export living here —
/// two archives claiming to be everything is one lie waiting to be noticed,
/// so the richer one (per-entity JSON, expenses, goals, a README, a days.csv
/// that reimports) is now the only one.
/// </summary>
[Authorize]
[Route("shifter/v1/account/export")]
[EnableRateLimiting(HardeningExtensions.AuthPolicy)]
public class ExportController : ControllerBase
{
    private readonly TakeoutService _takeout;

    public ExportController(TakeoutService takeout) => _takeout = takeout;

    [HttpGet]
    public async Task<IActionResult> Everything(CancellationToken ct)
        => File(
            await _takeout.BuildAsync(UserId(), ct),
            "application/zip",
            $"shifter-export-{DateOnly.FromDateTime(DateTime.UtcNow.Date):yyyy-MM-dd}.zip");

    private int UserId()
    {
        var id = User.FindFirstValue(ClaimTypes.NameIdentifier);

        if (!int.TryParse(id, out var userId))
            throw new UnauthorizedException("Token is missing the required claims.");

        return userId;
    }
}
