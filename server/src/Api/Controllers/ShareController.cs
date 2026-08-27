using System.Net;
using System.Text;

using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

using Shifter.Application.Features.Gigs;
using Shifter.Domain.Entities;
using Shifter.Infrastructure.Persistence.DbContexts;

namespace Shifter.Api.Controllers;

/// <summary>
/// Share links for a gig: shifter.ink/g/42. A chat's link preview crawler
/// gets a tiny HTML page with Open Graph tags — venue, trade, pay, date —
/// while a human is bounced straight into the board. Nothing here needs a
/// token, and nothing here leaks: what is on the card is what is already
/// public to every signed-in person on the board, minus the contacts, which
/// never live on a listing in the first place.
/// </summary>
[AllowAnonymous]
[Route("g")]
public class ShareController : ControllerBase
{
    private readonly ShifterDbContext _db;

    public ShareController(ShifterDbContext db) => _db = db;

    [HttpGet("{id:int}")]
    public async Task<IActionResult> Preview(int id, CancellationToken ct)
    {
        var gig = await _db.GigListings
            .AsNoTracking()
            .FirstOrDefaultAsync(row => row.Id == id && row.Status != GigStatus.Closed, ct);

        if (gig is null) return Redirect("/gigs");

        var trade = GigRules.CategoryRu.GetValueOrDefault(gig.Category, GigRules.CategoryNames[gig.Category]);
        var pay = new List<string>();

        if (gig.PayAmount > 0)
        {
            var period = gig.PayPeriod switch
            {
                "hour" => "за час",
                "month" => "в месяц",
                _ => "за смену",
            };

            pay.Add($"{gig.PayAmount:N0} ₴ {period}");
        }

        if (gig.PayPercent is decimal percent) pay.Add($"{percent}% с продаж");

        var title = $"{gig.Title} — {gig.Venue}";
        var description =
            $"{gig.City} · {gig.Date:dd.MM} · {gig.StartTime:HH\\:mm}–{gig.EndTime:HH\\:mm}"
            + (pay.Count > 0 ? $" · {string.Join(" + ", pay)}" : "")
            + $" · {(gig.Employment == GigEmployment.Permanent ? "постоянная работа" : "разовая смена")}"
            + $" · {trade}";

        // The card's first photo is the preview image, served from the sibling
        // endpoint because an og:image must be a URL, never a data URI.
        var origin = $"{Request.Scheme}://{Request.Host}";
        var image = gig.PhotosJson.Length > 4 ? $"{origin}/g/{id}/photo" : $"{origin}/icon-512.png";

        var html = $"""
            <!doctype html>
            <html lang="ru">
            <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width,initial-scale=1">
            <title>{Escape(title)} · Shifter</title>
            <meta name="description" content="{Escape(description)}">
            <meta property="og:type" content="website">
            <meta property="og:site_name" content="Shifter">
            <meta property="og:title" content="{Escape(title)}">
            <meta property="og:description" content="{Escape(description)}">
            <meta property="og:image" content="{Escape(image)}">
            <meta property="og:url" content="{Escape($"{origin}/g/{id}")}">
            <meta name="twitter:card" content="summary_large_image">
            <meta http-equiv="refresh" content="0; url=/gigs">
            </head>
            <body style="font:16px system-ui;padding:2rem;background:#f4f2ed;color:#1c1b18">
            <p><b>{Escape(title)}</b></p>
            <p>{Escape(description)}</p>
            <p><a href="/gigs">Открыть на бирже Shifter →</a></p>
            </body>
            </html>
            """;

        return Content(html, "text/html; charset=utf-8", Encoding.UTF8);
    }

    /// <summary>The listing's first photo, decoded from its data URL for crawlers.</summary>
    [HttpGet("{id:int}/photo")]
    public async Task<IActionResult> Photo(int id, CancellationToken ct)
    {
        var gig = await _db.GigListings
            .AsNoTracking()
            .FirstOrDefaultAsync(row => row.Id == id && row.Status != GigStatus.Closed, ct);

        if (gig is null) return NotFound();

        string[] photos;

        try
        {
            photos = System.Text.Json.JsonSerializer.Deserialize<string[]>(gig.PhotosJson) ?? [];
        }
        catch
        {
            photos = [];
        }

        var first = photos.FirstOrDefault();
        const string prefix = "data:image/jpeg;base64,";

        if (first is null || !first.StartsWith(prefix, StringComparison.Ordinal)) return NotFound();

        try
        {
            return File(Convert.FromBase64String(first[prefix.Length..]), "image/jpeg");
        }
        catch (FormatException)
        {
            return NotFound();
        }
    }

    private static string Escape(string value) => WebUtility.HtmlEncode(value);
}
