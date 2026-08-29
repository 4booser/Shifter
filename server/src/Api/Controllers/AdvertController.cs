using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

using Shifter.Domain.Entities;

namespace Shifter.Api.Controllers;

/// <summary>
/// A job advert read into the beginnings of a shift template.
///
/// Costs nothing to run and stores nothing: the text goes in, a handful of
/// numbers come back, and the person edits them in the form. Somebody's job
/// hunt is their business and there is no reason for it to be written down
/// here.
/// </summary>
[Authorize]
[Route("shifter/v1/advert")]
public class AdvertController : ControllerBase
{
    [HttpPost("read")]
    public IActionResult ReadAdvert([FromBody] AdvertDto request)
    {
        var read = JobAdvert.Parse(request.text);

        return Ok(new
        {
            // Null all the way down for anything the advert did not say. A
            // blank field in the form is a question; a filled one is an
            // answer, and only one of those can be wrong about somebody's pay.
            pay_amount = read.PayAmount,
            pay_period = read.PayPeriod,
            percent = read.Percent,
            start = read.Start?.ToString("HH:mm"),
            end = read.End?.ToString("HH:mm"),
            break_minutes = read.BreakMinutes,
        });
    }
}

public record AdvertDto(string? text);
