using System.Security.Claims;

using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;

using Shifter.Api.Extensions;
using Shifter.Application.Features.Papers;

namespace Shifter.Api.Controllers;

/// <summary>
/// The papers: the income statement, the accountant's CSV, the chronicle.
/// The takeout lives at /account/export, where clients have always fetched it.
///
/// Rate-limited under the assistant's ceiling: each of these walks a whole
/// account, and an account is walked for a reason, not in a loop.
/// </summary>
[Authorize]
[EnableRateLimiting(HardeningExtensions.AssistantPolicy)]
[Route("shifter/v1/papers")]
public class PapersController : ControllerBase
{
    private readonly PapersService _papers;
    private readonly ChronicleService _chronicle;

    public PapersController(PapersService papers, ChronicleService chronicle)
    {
        _papers = papers;
        _chronicle = chronicle;
    }

    /// <summary>The private chronicle — the reader's own eyes only, by construction.</summary>
    [HttpGet("chronicle")]
    public async Task<IActionResult> Chronicle(CancellationToken ct)
        => Ok((await _chronicle.ReadAsync(UserId(), ct)).Select(chapter => new
        {
            location_id = chapter.LocationId,
            name = chapter.Name,
            first_day = chapter.FirstDay,
            last_day = chapter.LastDay,
            days = chapter.DaysWorked,
            hours = chapter.Hours,
            earned = chapter.Earned,
            rate_first = chapter.RateFirst,
            rate_last = chapter.RateLast,
            current = chapter.Current,
            note = chapter.PrivateNote,
            currency = chapter.Currency,
        }));

    public record NoteDto(string? note);

    [HttpPut("chronicle/{locationId:int}/note")]
    public async Task<IActionResult> Note(
        int locationId, [FromBody] NoteDto request, CancellationToken ct)
    {
        await _chronicle.NoteAsync(UserId(), locationId, request.note, ct);

        return NoContent();
    }

    [HttpGet("income.pdf")]
    public async Task<IActionResult> Income(
        [FromQuery] DateOnly from,
        [FromQuery] DateOnly to,
        [FromQuery] string? lang,
        CancellationToken ct)
    {
        var pdf = await _papers.IncomeStatementAsync(
            UserId(), from, to, lang == "uk" ? "uk" : "ru", ct);

        return File(pdf, "application/pdf", $"shifter-income-{from:yyyy-MM}-{to:yyyy-MM}.pdf");
    }

    [HttpGet("accountant.csv")]
    public async Task<IActionResult> Accountant(
        [FromQuery] DateOnly from,
        [FromQuery] DateOnly to,
        [FromQuery] string? lang,
        CancellationToken ct)
    {
        var csv = await _papers.AccountantCsvAsync(
            UserId(), from, to, lang == "uk" ? "uk" : "ru", ct);

        return File(
            System.Text.Encoding.UTF8.GetBytes(csv),
            "text/csv; charset=utf-8",
            $"shifter-accountant-{from:yyyy-MM}-{to:yyyy-MM}.csv");
    }
    private int UserId() => int.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);
}
