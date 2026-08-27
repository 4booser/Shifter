using System.Security.Claims;

using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

using Shifter.Application.Common.Exceptions;
using Shifter.Application.Features.Teams.DTOs;
using Shifter.Application.Features.Teams.Services;

namespace Shifter.Api.Controllers;

/// <summary>Two shifts, two people, two agreements.</summary>
[Authorize]
[Route("shifter/v1/teams/{teamId:int}/swaps")]
public class SwapsController : ControllerBase
{
    private readonly SwapService _swaps;

    public SwapsController(SwapService swaps) => _swaps = swaps;

    [HttpGet]
    public async Task<IActionResult> Mine(int teamId, CancellationToken ct)
        => Ok(await _swaps.MineAsync(UserId(), teamId, ct));

    [HttpPost]
    public async Task<IActionResult> Propose(int teamId, [FromBody] SwapProposeDto request, CancellationToken ct)
        => Ok(await _swaps.ProposeAsync(UserId(), teamId, request, ct));

    [HttpPost("{id:int}/accept")]
    public async Task<IActionResult> Accept(int teamId, int id, CancellationToken ct)
        => Ok(await _swaps.AcceptAsync(UserId(), teamId, id, ct));

    [HttpPost("{id:int}/withdraw")]
    public async Task<IActionResult> Withdraw(int teamId, int id, CancellationToken ct)
        => Ok(await _swaps.WithdrawAsync(UserId(), teamId, id, ct));

    private int UserId()
    {
        var id = User.FindFirstValue(ClaimTypes.NameIdentifier);

        if (!int.TryParse(id, out var userId))
            throw new UnauthorizedException("Token is missing the required claims.");

        return userId;
    }
}
