using System.Net;
using System.Text;

using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

using Shifter.Application.Features.Gigs;
using Shifter.Application.Features.Telegram;
using Shifter.Domain.Entities;
using Shifter.Infrastructure.Persistence.DbContexts;
using Shifter.Application.Common.Text;

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

    /// <summary>
    /// A numeric link is no longer a preview. It used to be, and counting from
    /// one walked the entire board — every open listing's venue, city, date,
    /// hours and pay — without an account, which is the one party the board's
    /// own rules say must not have it. Links already in circulation land on the
    /// board itself rather than nowhere.
    /// </summary>
    [HttpGet("{id:int}")]
    public IActionResult Numeric(int id) => Redirect("/gigs");

    [HttpGet("{slug:length(12)}")]
    public async Task<IActionResult> Preview(string slug, CancellationToken ct)
    {
        var gig = await _db.GigListings
            .AsNoTracking()
            .FirstOrDefaultAsync(row => row.ShareSlug == slug && row.Status != GigStatus.Closed, ct);

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

            // A page anybody can open, with a wage on it, grouped by
            // whatever culture the server happened to start with.
            pay.Add($"{Figures.Money(gig.PayAmount)} {period}");
        }

        if (gig.PayPercent is decimal percent) pay.Add($"{percent.ToString(Figures.Ru)}% с продаж");

        var title = $"{gig.Title} — {gig.Venue}";
        var description =
            $"{gig.City} · {gig.Date:dd.MM} · {gig.StartTime:HH\\:mm}–{gig.EndTime:HH\\:mm}"
            + (pay.Count > 0 ? $" · {string.Join(" + ", pay)}" : "")
            + $" · {(gig.Employment == GigEmployment.Permanent ? "постоянная работа" : "разовая смена")}"
            + $" · {trade}";

        // The card's first photo is the preview image, served from the sibling
        // endpoint because an og:image must be a URL, never a data URI.
        var origin = $"{Request.Scheme}://{Request.Host}";
        var image = gig.PhotosJson.Length > 4 ? $"{origin}/g/{gig.ShareSlug}/photo" : $"{origin}/icon-512.png";

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
            <meta property="og:url" content="{Escape($"{origin}/g/{gig.ShareSlug}")}">
            <meta name="twitter:card" content="summary_large_image">
            </head>
            <body style="font:16px system-ui;padding:2rem;background:#f4f2ed;color:#1c1b18">
            <!--
              This page used to carry a zero-second meta refresh to /gigs, so
              everything below was written and then thrown away: somebody
              followed a link to one shift and landed on a board of all of
              them, with no way back to the one they were sent. The page shows
              what was shared and offers the board as a next step, which is
              what the link promised. Crawlers were always reading the meta
              tags above and are unaffected.
            -->
            <p><b>{Escape(title)}</b></p>
            <p>{Escape(description)}</p>
            <p><a href="/gigs">Открыть на бирже Shifter →</a></p>
            </body>
            </html>
            """;

        return Content(html, "text/html; charset=utf-8", Encoding.UTF8);
    }

    /// <summary>The listing's first photo, decoded from its data URL for crawlers.</summary>
    [HttpGet("{slug:length(12)}/photo")]
    public async Task<IActionResult> Photo(string slug, CancellationToken ct)
    {
        var gig = await _db.GigListings
            .AsNoTracking()
            .FirstOrDefaultAsync(row => row.ShareSlug == slug && row.Status != GigStatus.Closed, ct);

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

    /// <summary>
    /// Somebody's work history, at a link they chose to hand out.
    ///
    /// Anonymous by necessity: it exists to be sent to a manager who does not
    /// have an account and is not going to make one. Keyed on an unguessable
    /// slug rather than a user id, so it reaches only the people it was given
    /// to — and it shows exactly what its owner switched on, which by default
    /// is months, shifts and hours, with no venue names and no money.
    /// </summary>
    [HttpGet("~/c/{slug:length(12)}")]
    public async Task<IActionResult> Card(
        [FromServices] Shifter.Infrastructure.Repositories.Interfaces.IShifterQuery query,
        [FromServices] Shifter.Application.Common.Time.AppClock clock,
        string slug,
        CancellationToken ct)
    {
        var user = await _db.Users
            .AsNoTracking()
            .FirstOrDefaultAsync(row => row.CardSlug == slug, ct);

        if (user is null) return Redirect("/");

        DateOnly today = clock.Today;

        var days = await query.GetDaysInRangeAsync(user.Id, new DateOnly(2000, 1, 1), today, ct);
        var places = await query.GetLocationsAsync(user.Id, true, ct);

        var history = Shifter.Application.Features.business.Services.WorkHistory.Of(
            days, places.ToDictionary(place => place.Id), today, user.CardShowsMoney);

        // «2025-08 — 2026-09» on the one page a stranger reads about somebody's
        // work. The app's own record page has said «август 2025 — сентябрь
        // 2026» for months; this, which is the copy handed to an employer,
        // had not.
        static string Month(string yyyyMM) =>
            DateOnly.TryParseExact($"{yyyyMM}-01", "yyyy-MM-dd", out var date)
                // «MMMM», not «LLLL»: the standalone-month specifier is an
                // ICU one and .NET emits it literally, so the page read «LLLL
                // 2025». Without a day in the pattern .NET already gives the
                // nominative, which is what a month standing alone wants.
                ? date.ToString("MMMM yyyy", Figures.Ru)
                : yyyyMM;

        string name = $"{user.FirstName} {user.LastName}".Trim();
        string headline = history.shifts == 0
            ? "Пока без записей"
            // Declined: this page is the one a stranger reads, and it said
            // «1 смен» to anyone with a first month behind them.
            : $"{history.months} мес · {history.shifts} {TelegramCommands.Plural(history.shifts, "смена", "смены", "смен")} · {Figures.Count(history.hours)} ч";

        var rows = history.places
            .Select(place => user.CardShowsPlaces
                ? $"{Escape(place.name)} · {Month(place.from)} — {Month(place.to)} · {place.shifts} {TelegramCommands.Plural(place.shifts, "смена", "смены", "смен")}"
                : $"{Month(place.from)} — {Month(place.to)} · {place.shifts} {TelegramCommands.Plural(place.shifts, "смена", "смены", "смен")}")
            .ToArray();

        string body = string.Join("", rows.Select(row => $"<li>{row}</li>"));
        string roles = string.Join(", ", history.roles.Select(Escape));

        return Content(
            $$"""
            <!doctype html><html lang="ru"><head><meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1">
            <title>{{Escape(name)}} — Shifter</title>
            <meta name="robots" content="noindex">
            <style>
              body{margin:0;background:#f4f2ed;color:#1c1b18;font:16px/1.55 system-ui,sans-serif;padding:2rem 1.25rem}
              main{max-width:34rem;margin:0 auto}
              h1{font-size:1.6rem;margin:0 0 .25rem;letter-spacing:-.02em}
              .big{font-size:1.15rem;font-weight:700;margin:0 0 1.25rem}
              ul{list-style:none;padding:0;margin:0 0 1.25rem}
              li{padding:.5rem 0;border-bottom:1px solid #e3ded2}
              .roles{color:#6f6a5e}
              footer{margin-top:2rem;color:#8c8578;font-size:.85rem}
              a{color:#4a44c8}
            </style></head><body><main>
            <h1>{{Escape(name)}}</h1>
            <p class="big">{{headline}}</p>
            <ul>{{body}}</ul>
            {{(roles.Length > 0 ? $"<p class=\"roles\">{roles}</p>" : "")}}
            <footer>Посчитано по записанным сменам в <a href="/">Shifter</a>.</footer>
            </main></body></html>
            """,
            "text/html; charset=utf-8");
    }
}
