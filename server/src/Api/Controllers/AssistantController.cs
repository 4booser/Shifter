using System.Security.Claims;

using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

using Shifter.Application.Common.Exceptions;
using Shifter.Application.Features.Assistant;

namespace Shifter.Api.Controllers;

/// <summary>
/// The assistant: a thread you can ask about your own months, the blanks it
/// would like filled, and a written-out period on demand. Every figure it
/// quotes is one the calendar already computed.
/// </summary>
[Authorize]
[Route("shifter/v1/assistant")]
public class AssistantController : ControllerBase
{
    private readonly AssistantService _assistant;

    public AssistantController(AssistantService assistant) => _assistant = assistant;

    [HttpGet("messages")]
    public async Task<IActionResult> Messages(CancellationToken ct)
        => Ok((await _assistant.ThreadAsync(UserId(), ct)).Select(Shape));

    [HttpPost("ask")]
    public async Task<IActionResult> Ask([FromBody] AskDto request, CancellationToken ct)
    {
        // The client sends its own dates: a month is a local idea, and asking
        // about "this month" in UTC is asking about the wrong one twice a year.
        var today = request.today ?? DateOnly.FromDateTime(DateTime.UtcNow);
        var from = request.from ?? new DateOnly(today.Year, today.Month, 1);
        var to = request.to ?? today;

        return Ok(Shape(await _assistant.AskAsync(UserId(), request.text ?? "", from, to, today, ct)));
    }

    [HttpDelete("messages")]
    public async Task<IActionResult> Clear(CancellationToken ct)
    {
        await _assistant.ClearAsync(UserId(), ct);

        return NoContent();
    }

    [HttpGet("report")]
    public async Task<IActionResult> Report(
        [FromQuery] DateOnly from, [FromQuery] DateOnly to, CancellationToken ct)
        => Ok(await _assistant.ReportAsync(UserId(), from, to, ct));

    [HttpGet("gaps")]
    public async Task<IActionResult> Gaps([FromQuery] DateOnly? today, CancellationToken ct)
        => Ok(await _assistant.GapsAsync(
            UserId(), today ?? DateOnly.FromDateTime(DateTime.UtcNow), ct));

    [HttpPost("gaps")]
    public async Task<IActionResult> AnswerGap([FromBody] GapAnswerDto request, CancellationToken ct)
    {
        if (request.kind is not ("tips" or "revenue" or "pool"))
            throw new ValidationException("Такой вопрос мы не задавали.");

        await _assistant.AnswerGapAsync(
            UserId(), request.kind, request.date, request.shift_id, request.value, ct);

        return NoContent();
    }

    private static object Shape(Shifter.Domain.Entities.AssistantMessage message) => new
    {
        id = message.Id,
        role = message.Role,
        text = message.Text,
        source = message.Source,
        created_at = message.CreatedAt,
    };

    private int UserId()
    {
        var id = User.FindFirstValue(ClaimTypes.NameIdentifier);

        if (!int.TryParse(id, out var userId))
            throw new UnauthorizedException("Token is missing the required claims.");

        return userId;
    }
}

public record AskDto(string? text, DateOnly? from, DateOnly? to, DateOnly? today);

public record GapAnswerDto(string kind, DateOnly date, int? shift_id, decimal value);
