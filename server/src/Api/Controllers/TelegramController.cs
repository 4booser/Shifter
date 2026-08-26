using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using Shifter.Application.Common.Exceptions;
using Shifter.Application.Features.Telegram;
using Shifter.Infrastructure.Persistence.DbContexts;

namespace Shifter.Api.Controllers;

/// <summary>The account side of the bot: link codes, status, unlink.</summary>
[Authorize]
[Route("shifter/v1/telegram")]
public class TelegramController : ControllerBase
{
    private readonly ShifterDbContext _db;
    private readonly TelegramOptions _options;

    public TelegramController(ShifterDbContext db, IOptions<TelegramOptions> options)
    {
        _db = db;
        _options = options.Value;
    }

    [HttpGet]
    public async Task<ActionResult> Status(CancellationToken ct)
    {
        if (!_options.Enabled) return NotFound();

        var linked = await _db.TelegramLinks.AnyAsync(link => link.UserId == UserId(), ct);

        return Ok(new { linked, bot = _options.BotName });
    }

    [HttpPost("link-code")]
    public ActionResult LinkCode()
    {
        if (!_options.Enabled) return NotFound();

        return Ok(new { code = TelegramBotService.IssueLinkCode(UserId()), bot = _options.BotName });
    }

    [HttpDelete]
    public async Task<ActionResult> Unlink(CancellationToken ct)
    {
        await _db.TelegramLinks
            .Where(link => link.UserId == UserId())
            .ExecuteDeleteAsync(ct);

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
