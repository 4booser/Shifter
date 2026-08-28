using System.Security.Claims;

using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

using Shifter.Application.Features.Tax;

namespace Shifter.Api.Controllers;

/// <summary>
/// Somebody's own tax arrangement, in their own numbers.
///
/// Not one figure here originates with us. The endpoint stores what a person
/// typed off their own registration and does arithmetic on it.
/// </summary>
[Authorize]
[Route("shifter/v1/tax")]
public class TaxController : ControllerBase
{
    private readonly TaxService _tax;

    public TaxController(TaxService tax) => _tax = tax;

    [HttpGet("{year:int}")]
    public async Task<IActionResult> Read(int year, [FromQuery] DateOnly? today, CancellationToken ct)
    {
        var reading = await _tax.ReadAsync(
            UserId(), year, today ?? DateOnly.FromDateTime(DateTime.UtcNow), ct);

        // No profile is not an empty profile. A client shown zeroes would draw
        // a tax bill of nothing for somebody who has told us nothing.
        if (reading is null) return Ok(new { profile = (object?)null });

        return Ok(new
        {
            profile = new
            {
                name = reading.Profile.Name,
                year = reading.Profile.Year,
                percent = reading.Profile.Percent,
                fixed_monthly = reading.Profile.FixedMonthly,
                social_monthly = reading.Profile.SocialMonthly,
                annual_limit = reading.Profile.AnnualLimit,
                basis = reading.Profile.Basis,
            },
            income = reading.Figures.Income,
            on_income = reading.Figures.OnIncome,
            flat = reading.Figures.Flat,
            social = reading.Figures.Social,
            total = reading.Figures.Total,
            limit_used = reading.Figures.LimitUsed,
            limit_on = reading.Figures.LimitOn?.ToString("yyyy-MM-dd"),
            // They asked for money received and have recorded none, so this is
            // earnings instead. Said out loud: a zero would read as a quiet
            // year rather than as an empty ledger.
            fell_back_to_earned = reading.Fell,
        });
    }

    [HttpPut]
    public async Task<IActionResult> Save(
        [FromBody] TaxService.SaveDto request, CancellationToken ct)
    {
        var saved = await _tax.SaveAsync(UserId(), request, ct);

        return Ok(new { saved.Name, saved.Year });
    }

    [HttpDelete("{year:int}")]
    public async Task<IActionResult> Delete(int year, CancellationToken ct)
    {
        await _tax.DeleteAsync(UserId(), year, ct);

        return NoContent();
    }

    private int UserId() => int.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);
}
