using System.Security.Claims;
using System.Security.Cryptography;
using System.Text;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.EntityFrameworkCore;
using Shifter.Api.Extensions;
using Shifter.Application.Common.Exceptions;
using Shifter.Application.Features.business.DTOs;
using Shifter.Application.Features.business.Services.Interfaces;
using Shifter.Infrastructure.Persistence.DbContexts;

namespace Shifter.Api.Controllers;

/// <summary>
/// The calendar-subscription feed: a secret URL Google or Apple Calendar
/// polls on its own schedule, so shifts placed here appear on the phone
/// without anyone exporting anything. Names and times travel; money never
/// does — a subscribed calendar is shared far more casually than an account.
/// </summary>
[Route("")]
public class FeedController : ControllerBase
{
    /// <summary>Two months back for context, six ahead for planning.</summary>
    private static readonly (int Back, int Ahead) Range = (62, 186);

    private readonly ShifterDbContext _db;
    private readonly IDayHandler _days;
    private readonly IEventHandler _events;

    public FeedController(ShifterDbContext db, IDayHandler days, IEventHandler events)
    {
        _db = db;
        _days = days;
        _events = events;
    }

    [HttpGet("feed/{token}.ics")]
    [AllowAnonymous]
    [EnableRateLimiting(HardeningExtensions.AuthPolicy)]
    public async Task<IActionResult> Calendar(string token, CancellationToken ct)
    {
        if (token.Length is < 24 or > 64) return NotFound();

        var user = await _db.Users
            .AsNoTracking()
            .FirstOrDefaultAsync(u => u.FeedToken == token && u.IsActive, ct);

        if (user is null) return NotFound();

        var today = DateOnly.FromDateTime(DateTime.UtcNow.Date);
        var from = today.AddDays(-Range.Back);
        var to = today.AddDays(Range.Ahead);

        var days = await _days.ListAsync(user.Id, from, to, ct);
        var events = await _events.ListAsync(user.Id, from, to, ct);

        return File(Encoding.UTF8.GetBytes(Build(days.days, events)), "text/calendar; charset=utf-8");
    }

    private static string Build(DayDto[] days, EventDto[] events)
    {
        var lines = new List<string>
        {
            "BEGIN:VCALENDAR",
            "VERSION:2.0",
            "PRODID:-//Shifter//Feed//EN",
            "CALSCALE:GREGORIAN",
            "X-WR-CALNAME:Shifter",
            // Subscribers poll; an hour is fresh enough for a rota.
            "X-PUBLISHED-TTL:PT1H",
        };

        foreach (var day in days)
        {
            foreach (var shift in day.shifts)
            {
                var start = day.date.ToDateTime(TimeOnly.Parse(shift.start_time));
                var end = day.date.ToDateTime(TimeOnly.Parse(shift.end_time));

                // The clock wrapping past midnight means the end is tomorrow.
                if (end <= start) end = end.AddDays(1);

                lines.Add("BEGIN:VEVENT");
                lines.Add($"UID:shift-{day.date:yyyyMMdd}-{shift.shift_id}@shifter.ink");
                lines.Add($"DTSTART:{start:yyyyMMdd'T'HHmmss}");
                lines.Add($"DTEND:{end:yyyyMMdd'T'HHmmss}");
                lines.Add($"SUMMARY:{Escape(shift.name)}");
                lines.Add($"STATUS:{(shift.worked ? "CONFIRMED" : "TENTATIVE")}");
                lines.Add("END:VEVENT");
            }
        }

        foreach (var entry in events)
        {
            lines.Add("BEGIN:VEVENT");
            lines.Add($"UID:event-{entry.id}-{entry.start_date:yyyyMMdd}@shifter.ink");
            lines.Add($"DTSTART;VALUE=DATE:{entry.start_date:yyyyMMdd}");
            lines.Add($"DTEND;VALUE=DATE:{entry.end_date.AddDays(1):yyyyMMdd}");
            lines.Add($"SUMMARY:{Escape(entry.name)}");
            lines.Add("END:VEVENT");
        }

        lines.Add("END:VCALENDAR");

        return string.Join("\r\n", lines) + "\r\n";
    }

    private static string Escape(string text)
        => text.Replace("\\", "\\\\").Replace(";", "\\;").Replace(",", "\\,").Replace("\n", "\\n");

    // ==== The owner's side ====

    [Authorize]
    [HttpGet("shifter/v1/feed")]
    public async Task<ActionResult> Current(CancellationToken ct)
    {
        var token = await _db.Users
            .Where(u => u.Id == CurrentUserId())
            .Select(u => u.FeedToken)
            .FirstOrDefaultAsync(ct);

        return Ok(new { token });
    }

    /// <summary>Creates or rotates: the previous link dies either way.</summary>
    [Authorize]
    [HttpPost("shifter/v1/feed")]
    public async Task<ActionResult> Rotate(CancellationToken ct)
    {
        var token = Convert.ToHexStringLower(RandomNumberGenerator.GetBytes(16));

        await _db.Users
            .Where(u => u.Id == CurrentUserId())
            .ExecuteUpdateAsync(setters => setters.SetProperty(u => u.FeedToken, token), ct);

        return Ok(new { token });
    }

    [Authorize]
    [HttpDelete("shifter/v1/feed")]
    public async Task<ActionResult> Disable(CancellationToken ct)
    {
        await _db.Users
            .Where(u => u.Id == CurrentUserId())
            .ExecuteUpdateAsync(setters => setters.SetProperty(u => u.FeedToken, (string?)null), ct);

        return NoContent();
    }

    private int CurrentUserId()
    {
        var id = User.FindFirstValue(ClaimTypes.NameIdentifier);

        if (!int.TryParse(id, out var userId))
            throw new UnauthorizedException("Token is missing the required claims.");

        return userId;
    }
}
