using System.Globalization;
using System.IO.Compression;
using System.Security.Claims;
using System.Text;
using System.Text.Json;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using Shifter.Api.Extensions;
using Shifter.Application.Common.Exceptions;
using Shifter.Application.Features.business.Services.Interfaces;

namespace Shifter.Api.Controllers;

/// <summary>
/// "Download everything": one ZIP with the full model as JSON and the days
/// as a spreadsheet-friendly CSV. Partly a GDPR courtesy, mostly a promise
/// — the numbers are the person's, and they can walk out with them any day.
/// </summary>
[Authorize]
[Route("shifter/v1/account/export")]
[EnableRateLimiting(HardeningExtensions.AuthPolicy)]
public class ExportController : ControllerBase
{
    private static readonly DateOnly From = new(2000, 1, 1);
    private static readonly DateOnly To = new(2099, 12, 31);

    private readonly IDayHandler _days;
    private readonly IShiftHandler _shifts;
    private readonly ILocationHandler _locations;
    private readonly ISalesHandler _sales;
    private readonly IPayoutHandler _payouts;
    private readonly IGoalHandler _goals;
    private readonly IEventHandler _events;

    public ExportController(
        IDayHandler days,
        IShiftHandler shifts,
        ILocationHandler locations,
        ISalesHandler sales,
        IPayoutHandler payouts,
        IGoalHandler goals,
        IEventHandler events)
    {
        _days = days;
        _shifts = shifts;
        _locations = locations;
        _sales = sales;
        _payouts = payouts;
        _goals = goals;
        _events = events;
    }

    [HttpGet]
    public async Task<IActionResult> Everything(CancellationToken ct)
    {
        var userId = UserId();

        var days = await _days.ListAsync(userId, From, To, ct);
        var payload = new
        {
            exported_at = DateTime.UtcNow,
            days = days.days,
            totals = new { days.total_earned, days.hours, days.days_worked, days.tips_earned, days.tax, days.net_earned },
            shifts = await _shifts.ListAsync(userId, includeArchived: true, ct),
            locations = await _locations.ListAsync(userId, includeArchived: true, ct),
            sales_positions = await _sales.ListAsync(userId, includeArchived: true, ct),
            payouts = await _payouts.ListAsync(userId, From, To, ct),
            goals = await _goals.ListAsync(userId, ct),
            events = await _events.ListAsync(userId, From, To, ct),
        };

        var json = JsonSerializer.SerializeToUtf8Bytes(
            payload,
            new JsonSerializerOptions { WriteIndented = true });

        var csv = new StringBuilder("date,hours,earned,tips,tips_cash,tip_out,deductions,note\n");

        // Invariant everywhere: a spreadsheet fed "27.08.2026" and "11,5"
        // by a Russian server locale is an import support ticket.
        var inv = CultureInfo.InvariantCulture;

        foreach (var day in days.days.OrderBy(entry => entry.date))
        {
            csv.Append(day.date.ToString("yyyy-MM-dd", inv)).Append(',')
                .Append(day.hours.ToString(inv)).Append(',')
                .Append(day.earned.ToString(inv)).Append(',')
                .Append((day.tips ?? 0).ToString(inv)).Append(',')
                .Append((day.tips_cash ?? 0).ToString(inv)).Append(',')
                .Append(day.tip_out.ToString(inv)).Append(',')
                .Append(day.deductions.ToString(inv)).Append(',')
                .Append('"').Append((day.note ?? "").Replace("\"", "\"\"")).Append('"')
                .Append('\n');
        }

        using var buffer = new MemoryStream();

        using (var zip = new ZipArchive(buffer, ZipArchiveMode.Create, leaveOpen: true))
        {
            await using (var entry = zip.CreateEntry("shifter-data.json").Open())
                await entry.WriteAsync(json, ct);

            await using (var entry = zip.CreateEntry("days.csv").Open())
                await entry.WriteAsync(Encoding.UTF8.GetBytes(csv.ToString()), ct);
        }

        return File(
            buffer.ToArray(),
            "application/zip",
            $"shifter-export-{DateOnly.FromDateTime(DateTime.UtcNow.Date):yyyy-MM-dd}.zip");
    }

    private int UserId()
    {
        var id = User.FindFirstValue(ClaimTypes.NameIdentifier);

        if (!int.TryParse(id, out var userId))
            throw new UnauthorizedException("Token is missing the required claims.");

        return userId;
    }
}
