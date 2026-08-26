using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Shifter.Application.Common.Exceptions;
using Shifter.Infrastructure.Persistence.DbContexts;

namespace Shifter.Api.Controllers;

/// <summary>
/// A day's history: every write that touched it, newest first. Read-only by
/// construction — the log answers "where did my tips go", it never argues.
/// </summary>
[Authorize]
[Route("shifter/v1/days")]
public class HistoryController : ControllerBase
{
    private readonly ShifterDbContext _db;

    public HistoryController(ShifterDbContext db) => _db = db;

    [HttpGet("{date}/history")]
    public async Task<ActionResult> History(string date, CancellationToken ct)
    {
        if (!DateOnly.TryParseExact(date, "yyyy-MM-dd", out var day))
            throw new ValidationException("The date looks wrong.");

        var rows = await _db.DayAudits
            .AsNoTracking()
            .Where(audit => audit.UserId == UserId() && audit.Date == day)
            .OrderByDescending(audit => audit.At)
            .Take(50)
            .Select(audit => new
            {
                at = audit.At,
                source = audit.Source,
                shift_count = audit.ShiftCount,
                worked_count = audit.WorkedCount,
                hours = audit.Hours,
                earned = audit.Earned,
                tips = audit.Tips,
                sales_units = audit.SalesUnits,
            })
            .ToArrayAsync(ct);

        return Ok(new { entries = rows });
    }

    private int UserId()
    {
        var id = User.FindFirstValue(ClaimTypes.NameIdentifier);

        if (!int.TryParse(id, out var userId))
            throw new UnauthorizedException("Token is missing the required claims.");

        return userId;
    }
}
