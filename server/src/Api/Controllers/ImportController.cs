using System.Security.Claims;
using Shifter.Api.Extensions;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Shifter.Application.Common.Exceptions;
using Shifter.Application.Features.Import;

namespace Shifter.Api.Controllers;

/// <summary>
/// The rota photographed on the wall becomes rows on the calendar. This
/// endpoint only reads — what lands on days is decided by a person on the
/// preview screen, and written through the ordinary day-save path.
/// </summary>
[Authorize]
[Route("shifter/v1/import")]
// A model call costs money, and this one is the most expensive in the app —
// the same reason the assistant and the daily brief carry a ceiling.
[EnableRateLimiting(HardeningExtensions.AssistantPolicy)]
public class ImportController : ControllerBase
{
    private const int MaxBytes = 8 * 1024 * 1024;

    private static readonly Dictionary<string, string> MediaTypes = new(StringComparer.OrdinalIgnoreCase)
    {
        [".jpg"] = "image/jpeg",
        [".jpeg"] = "image/jpeg",
        [".png"] = "image/png",
        [".webp"] = "image/webp",
        [".gif"] = "image/gif",
    };

    private readonly PhotoImportService _service;

    public ImportController(PhotoImportService service) => _service = service;

    [HttpPost("schedule")]
    [RequestSizeLimit(MaxBytes + 1024)]
    public async Task<ActionResult> Schedule(
        [FromForm] IFormFile photo,
        [FromForm] string employee,
        [FromForm] int year,
        [FromForm] int month,
        CancellationToken ct)
    {
        if (!_service.Enabled) return NotFound();

        if (photo.Length is 0 or > MaxBytes)
            throw new ValidationException("The photo must be under 8 MB.");

        var extension = Path.GetExtension(photo.FileName);

        if (!MediaTypes.TryGetValue(extension, out var mediaType))
            throw new ValidationException("JPEG, PNG, WebP or GIF — HEIC needs converting first.");

        if (employee.Trim().Length is < 1 or > 80)
            throw new ValidationException("Say how you are written in the rota.");

        if (month is < 1 or > 12 || year is < 2000 or > 2100)
            throw new ValidationException("The month looks wrong.");

        using var stream = new MemoryStream();

        await photo.CopyToAsync(stream, ct);

        var days = await _service.ReadAsync(
            CurrentUserId(), stream.ToArray(), mediaType, employee.Trim(), year, month, ct);

        return Ok(new { days });
    }

    private int CurrentUserId()
    {
        var id = User.FindFirstValue(ClaimTypes.NameIdentifier);

        if (!int.TryParse(id, out var userId))
            throw new UnauthorizedException("Token is missing the required claims.");

        return userId;
    }
}
