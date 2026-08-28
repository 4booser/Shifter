using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

using Shifter.Infrastructure.Persistence.DbContexts;

namespace Shifter.Api.Controllers;

/// <summary>
/// The way out of the month's letter.
///
/// One link, no login, one click. That is the whole difference between a
/// letter people tolerate and one they mark as spam — and a person who has to
/// sign in to stop hearing from you reports you instead.
/// </summary>
[AllowAnonymous]
[Route("letters")]
public class LettersController : ControllerBase
{
    private readonly ShifterDbContext _db;

    public LettersController(ShifterDbContext db) => _db = db;

    [HttpGet("stop")]
    [HttpPost("stop")]
    public async Task<IActionResult> Stop([FromQuery] string? key, CancellationToken ct)
    {
        var wanted = (key ?? string.Empty).Trim();

        // The same page either way. A link that says "no such subscription"
        // turns the unsubscribe endpoint into a way of testing whether a key
        // is real, and it worries the person who clicked twice.
        if (wanted.Length is > 0 and <= 64)
        {
            var user = await _db.Users.FirstOrDefaultAsync(row => row.LetterKey == wanted, ct);

            if (user is not null)
            {
                user.MonthlyLetter = false;

                await _db.SaveChangesAsync(ct);
            }
        }

        return Content(Page, "text/html; charset=utf-8");
    }

    /// <summary>
    /// Plain and self-contained. Somebody unsubscribing is already slightly
    /// annoyed; a page that loads a stylesheet from somewhere and shows them a
    /// spinner is worse than a sentence.
    /// </summary>
    private const string Page =
        "<!doctype html><html lang=\"ru\"><head><meta charset=\"utf-8\">"
        + "<meta name=\"viewport\" content=\"width=device-width,initial-scale=1\">"
        + "<title>Shifter</title></head>"
        + "<body style=\"font-family:-apple-system,Segoe UI,Roboto,sans-serif;"
        + "display:flex;align-items:center;justify-content:center;height:100vh;margin:0;"
        + "background:#f4f2ed;color:#1c1b18\">"
        + "<div style=\"text-align:center;padding:24px\">"
        + "<p style=\"font-size:20px;font-weight:600;margin:0 0 8px\">Письма отключены</p>"
        + "<p style=\"color:#6d6a61;margin:0\">Больше не пришлём. Включить обратно можно в настройках аккаунта.</p>"
        + "</div></body></html>";
}
