using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Shifter.Application.Common.Exceptions;
using Shifter.Infrastructure.Persistence.DbContexts;

namespace Shifter.Api.Controllers;

/// <summary>
/// The devices holding a key to this account: every live refresh token,
/// wearing the browser label it signed in with, individually revocable.
/// "Sign out everywhere" already exists; this is the scalpel next to it.
/// </summary>
[Authorize]
[Route("shifter/v1/account/sessions")]
public class SessionsController : ControllerBase
{
    private readonly TokensDbContext _tokens;

    public SessionsController(TokensDbContext tokens) => _tokens = tokens;

    [HttpGet]
    public async Task<ActionResult> List(CancellationToken ct)
    {
        var now = DateTime.UtcNow;

        var rows = await _tokens.Tokens
            .AsNoTracking()
            .Where(token => token.UserId == UserId() && token.RevokedAt == null && token.ExpiresAt > now)
            .OrderByDescending(token => token.CreatedAt)
            .Select(token => new
            {
                id = token.Id,
                created_at = token.CreatedAt,
                expires_at = token.ExpiresAt,
                user_agent = token.UserAgent,
            })
            .ToArrayAsync(ct);

        return Ok(new { sessions = rows });
    }

    [HttpDelete("{id:int}")]
    public async Task<ActionResult> Revoke(int id, CancellationToken ct)
    {
        var token = await _tokens.Tokens
            .FirstOrDefaultAsync(entry => entry.Id == id && entry.UserId == UserId(), ct)
            ?? throw new NotFoundException("Session does not exist.");

        token.Revoke(DateTime.UtcNow);
        await _tokens.SaveChangesAsync(ct);

        return NoContent();
    }

    private int UserId()
    {
        var id = User.FindFirstValue(ClaimTypes.NameIdentifier);

        if (!int.TryParse(id, out var userId))
            throw new UnauthorizedException("Token is missing the required claims.");

        return userId;
    }
}
