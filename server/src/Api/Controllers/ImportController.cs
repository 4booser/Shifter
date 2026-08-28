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
    private readonly CsvImportService _csv;

    public ImportController(PhotoImportService service, CsvImportService csv)
    {
        _service = service;
        _csv = csv;
    }

    /// <summary>
    /// Reads a file and writes nothing.
    ///
    /// The whole point of the two-step shape: a confident import that put tips
    /// in the wage column would be indistinguishable from a correct one a
    /// month later, so a person sees the grid before anything is saved.
    /// </summary>
    [HttpPost("csv/preview")]
    [RequestSizeLimit(CsvMaxBytes + 1024)]
    public async Task<ActionResult> CsvPreview([FromForm] IFormFile file, CancellationToken ct)
    {
        var preview = _csv.Read(await ReadCsvAsync(file, ct));

        return Ok(new
        {
            header = preview.Header,
            mapping = preview.Mapping,
            total = preview.TotalRows,
            problems = preview.Problems,
            rows = preview.Rows.Select(row => new
            {
                date = row.Date,
                hours = row.Hours,
                earned = row.Earned,
                tips = row.Tips,
                place = row.Place,
                note = row.Note,
            }),
        });
    }

    /// <summary>Writes the file under the mapping a person confirmed.</summary>
    [HttpPost("csv")]
    [RequestSizeLimit(CsvMaxBytes + 1024)]
    public async Task<ActionResult> CsvApply(
        [FromForm] IFormFile file,
        [FromForm] string mapping,
        [FromForm] string? start,
        CancellationToken ct)
    {
        var columns = System.Text.Json.JsonSerializer
            .Deserialize<Dictionary<string, int>>(mapping ?? "{}")
            ?? throw new ValidationException("The column mapping did not parse.");

        // Midday where the file has no times. The app does not invent an
        // evening shift out of a row that only says eight hours — the person
        // chooses the hour on the preview screen and owns that choice.
        var from = TimeOnly.TryParse(start, out var parsed) ? parsed : new TimeOnly(12, 0);

        var written = await _csv.ApplyAsync(
            CurrentUserId(), await ReadCsvAsync(file, ct), columns, from, ct);

        return Ok(new
        {
            days = written.Days,
            skipped = written.Skipped,
            places = written.Places,
        });
    }

    private const int CsvMaxBytes = 4 * 1024 * 1024;

    private static async Task<string> ReadCsvAsync(IFormFile file, CancellationToken ct)
    {
        if (file is null || file.Length is 0 or > CsvMaxBytes)
            throw new ValidationException("The file must be under 4 MB.");

        using var reader = new StreamReader(file.OpenReadStream());

        return await reader.ReadToEndAsync(ct);
    }

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
