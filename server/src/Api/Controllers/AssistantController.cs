using System.Security.Claims;
using Microsoft.EntityFrameworkCore;
using Shifter.Infrastructure.Repositories.Interfaces;
using Shifter.Infrastructure.Persistence.DbContexts;
using Shifter.Domain.Entities;
using Shifter.Application.Features.business.Services.Interfaces;
using Shifter.Application.Features.business.DTOs;
using Shifter.Application.Common.Time;

using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;

using Shifter.Api.Extensions;

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

    /// <summary>
    /// The case for a raise at one place, assembled out of the person's own
    /// record: how long the rate has stood still, how this place compares to
    /// the others they actually work, how many shifts they covered for
    /// somebody else.
    ///
    /// It answers "not yet" out loud when that is the answer. An app that
    /// talks somebody into a conversation they will lose has done them harm.
    /// </summary>
    [HttpGet("raise")]
    public async Task<ActionResult<RaiseCaseDto[]>> Raise(
        [FromServices] IShifterQuery query,
        [FromServices] IDayHandler days,
        [FromServices] ShifterDbContext db,
        [FromServices] AppClock clock,
        CancellationToken ct)
    {
        DateOnly today = clock.Today;
        int userId = UserId();

        // A year back: long enough for the record to mean something, short
        // enough that a rate from another era does not muddy the comparison.
        DaysDto year = await days.ListAsync(userId, today.AddYears(-1), today, ct);
        Location[] places = await query.GetLocationsAsync(userId, false, ct);

        // Shifts taken at short notice for somebody else. The favour nobody
        // writes down, which is exactly why it is worth writing down.
        int covers = await db.CoverOffers
            .AsNoTracking()
            .CountAsync(offer => offer.ClaimantUserId == userId && offer.AcceptedAt != null, ct);

        // The first day worked at each place, read from the days rather than
        // the projection: the day view does not carry a place per shift.
        Day[] raw = await query.GetDaysInRangeAsync(userId, today.AddYears(-1), today, ct);

        Dictionary<int, DateOnly?> firstAt = raw
            .SelectMany(day => (day.Shifts ?? [])
                .Where(entry => entry.Worked)
                .Select(entry => (Place: entry.Shift?.LocationId ?? 0, day.Date)))
            .GroupBy(pair => pair.Place)
            .ToDictionary(group => group.Key, group => (DateOnly?)group.Min(pair => pair.Date));

        List<RaiseCaseDto> cases = [];

        foreach (Location place in places)
        {
            LocationTotalDto? here = year.by_location
                .FirstOrDefault(entry => entry.location_id == place.Id);

            if (here is null || here.hours <= 0) continue;

            // How long at *this* place, not how long using the app. Counting
            // every day would tell somebody they had been at a cafe they
            // started last month for a year, which is the kind of wrong that
            // makes the rest of the page untrustworthy.
            DateOnly? started = firstAt.GetValueOrDefault(place.Id);

            int monthsHere = started is not DateOnly began
                ? 0
                : ((today.Year - began.Year) * 12) + today.Month - began.Month;

            cases.Add(RaiseCase.Build(
                place, here, year.by_location, year.raises, monthsHere, covers, today));
        }

        // The strongest case first: if somebody opens this once, it is the one
        // they should read.
        return Ok(cases
            .OrderByDescending(entry => entry.worth_asking)
            .ThenByDescending(entry => entry.points.Length)
            .ToArray());
    }

    [HttpGet("messages")]
    public async Task<IActionResult> Messages(CancellationToken ct)
        => Ok((await _assistant.ThreadAsync(UserId(), ct)).Select(Shape));

    [HttpPost("ask")]
    [EnableRateLimiting(HardeningExtensions.AssistantPolicy)]
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
    [EnableRateLimiting(HardeningExtensions.AssistantPolicy)]
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
