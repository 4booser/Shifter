using System.Security.Claims;

using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

using Shifter.Application.Common.Exceptions;
using Shifter.Infrastructure.Persistence.DbContexts;

namespace Shifter.Api.Controllers;

/// <summary>
/// The face on the profile. Three kinds and one hard budget: a photo arrives
/// as a small data URL the client already cropped square, a preset is an
/// emoji on a colour, a weave is a seed the client paints from the person's
/// own punch-card. Clearing it falls back to initials.
/// </summary>
[Authorize]
[Route("shifter/v1/account/avatar")]
public class AvatarController : ControllerBase
{
    /// <summary>~48KB of base64 — a 256×256 JPEG with room to spare.</summary>
    private const int PhotoBudget = 65_000;

    private readonly ShifterDbContext _db;

    public AvatarController(ShifterDbContext db) => _db = db;

    [HttpPut]
    public async Task<IActionResult> Set([FromBody] AvatarDto request, CancellationToken ct)
    {
        var user = await _db.Users.FirstOrDefaultAsync(row => row.Id == UserId(), ct)
            ?? throw new NotFoundException("No such account.");

        switch (request.kind)
        {
            case null or "":
                user.AvatarKind = null;
                user.AvatarData = null;
                break;

            case "photo":
                if (string.IsNullOrEmpty(request.data)
                    || !request.data.StartsWith("data:image/jpeg;base64,")
                    || request.data.Length > PhotoBudget)
                    throw new ValidationException("A photo is a JPEG data URL, at most ~48KB.");
                user.AvatarKind = "photo";
                user.AvatarData = request.data;
                break;

            case "preset":
                // "emoji|#RRGGBB" — tiny, but validated so the UI can trust it.
                var parts = (request.data ?? "").Split('|');
                if (parts.Length != 2 || parts[0].Length is 0 or > 8
                    || !System.Text.RegularExpressions.Regex.IsMatch(parts[1], "^#[0-9a-fA-F]{6}$"))
                    throw new ValidationException("A preset is emoji|#colour.");
                user.AvatarKind = "preset";
                user.AvatarData = request.data;
                break;

            case "weave":
                if ((request.data ?? "").Length > 200)
                    throw new ValidationException("A weave seed is small.");
                user.AvatarKind = "weave";
                user.AvatarData = request.data ?? "";
                break;

            default:
                throw new ValidationException("kind must be photo, preset, weave or empty.");
        }

        await _db.SaveChangesAsync(ct);

        return Ok(new { kind = user.AvatarKind, data = user.AvatarData });
    }

    /// <summary>
    /// The recovery address. Stored lowercase, unverified on purpose: a
    /// wrong address simply never receives a reset, and demanding a
    /// verification round-trip before the person has lost anything is a
    /// tax on people who are just filling in a profile.
    /// </summary>
    [HttpPut("email")]
    public async Task<IActionResult> Email([FromBody] EmailDto request, CancellationToken ct)
    {
        var user = await _db.Users.FirstOrDefaultAsync(row => row.Id == UserId(), ct)
            ?? throw new NotFoundException("No such account.");

        var address = request.email?.Trim().ToLowerInvariant();

        if (string.IsNullOrEmpty(address))
        {
            user.Email = null;
        }
        else
        {
            if (address.Length > 120 || !System.Text.RegularExpressions.Regex.IsMatch(address, @"^[^@\s]+@[^@\s.]+\.[^@\s]+$"))
                throw new ValidationException("That does not look like an email address.");

            if (await _db.Users.AnyAsync(row => row.Email == address && row.Id != user.Id, ct))
                throw new ConflictException("Another account already uses that address.");

            user.Email = address;
        }

        // Removing the address switches the letter off with it. Keeping the
        // subscription alive against an address that no longer exists is how
        // a product ends up writing to somebody's old work account for years.
        if (user.Email is null) user.MonthlyLetter = false;

        await _db.SaveChangesAsync(ct);

        return Ok(new { email = user.Email });
    }

    /// <summary>
    /// The month's letter, on or off.
    ///
    /// Off until somebody switches it on. An address given to recover a
    /// password is not permission to write to them, and treating it as one is
    /// how a product loses the address it actually needed.
    /// </summary>
    [HttpPut("letter")]
    public async Task<IActionResult> Letter([FromBody] LetterDto request, CancellationToken ct)
    {
        var user = await _db.Users.FirstOrDefaultAsync(row => row.Id == UserId(), ct)
            ?? throw new NotFoundException("No such account.");

        if (request.on && user.Email is null)
            throw new ValidationException("Add an address first — there is nowhere to send it.");

        user.MonthlyLetter = request.on;
        user.LetterKey ??= Application.Features.Mail.MonthlyLetterService.NewKey();

        // Switching on mid-month must not post last month's letter an hour
        // later: the first one comes at the start of the next month, which is
        // what somebody who just ticked a box expects.
        if (request.on && user.MonthlyLetterSent is null)
            user.MonthlyLetterSent = Application.Features.Mail.MonthlyLetterService
                .MonthFor(DateTime.UtcNow);

        await _db.SaveChangesAsync(ct);

        return Ok(new { on = user.MonthlyLetter });
    }

    /// <summary>
    /// This account's invite link, minted on first ask, plus how many people
    /// have arrived through it. A referral is a thank-you, not a funnel: it
    /// counts arrivals and nothing about them.
    /// </summary>
    [HttpGet("/shifter/v1/account/referral")]
    public async Task<IActionResult> Referral(CancellationToken ct)
    {
        var user = await _db.Users.FirstOrDefaultAsync(row => row.Id == UserId(), ct)
            ?? throw new NotFoundException("No such account.");

        if (string.IsNullOrWhiteSpace(user.ReferralCode))
        {
            // Short enough to read out loud, long enough not to collide.
            for (var attempt = 0; attempt < 5; attempt++)
            {
                var candidate = Convert.ToHexString(System.Security.Cryptography.RandomNumberGenerator.GetBytes(4))
                    .ToLowerInvariant();

                if (await _db.Users.AnyAsync(row => row.ReferralCode == candidate, ct)) continue;

                user.ReferralCode = candidate;
                break;
            }

            await _db.SaveChangesAsync(ct);
        }

        var invited = await _db.Users.CountAsync(row => row.InvitedByUserId == user.Id, ct);

        return Ok(new { code = user.ReferralCode, invited });
    }

    [HttpPut("contacts")]
    public async Task<IActionResult> Contacts([FromBody] ContactsDto request, CancellationToken ct)
    {
        var user = await _db.Users.FirstOrDefaultAsync(row => row.Id == UserId(), ct)
            ?? throw new NotFoundException("No such account.");

        user.ContactPhone = Clean(request.phone);
        user.ContactTelegram = Clean(request.telegram);
        await _db.SaveChangesAsync(ct);

        return Ok(new { phone = user.ContactPhone, telegram = user.ContactTelegram });
    }

    private static string? Clean(string? value)
    {
        var cleaned = value?.Trim();

        if (string.IsNullOrEmpty(cleaned)) return null;
        if (cleaned.Length > 80) throw new ValidationException("At most 80 characters.");

        return cleaned;
    }

    private int UserId()
    {
        var id = User.FindFirstValue(ClaimTypes.NameIdentifier);

        if (!int.TryParse(id, out var userId))
            throw new UnauthorizedException("Token is missing the required claims.");

        return userId;
    }
}

public record AvatarDto(string? kind, string? data);
public record ContactsDto(string? phone, string? telegram);
public record EmailDto(string? email);

public record LetterDto(bool on);
