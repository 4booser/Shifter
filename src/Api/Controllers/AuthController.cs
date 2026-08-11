using MediatR;
using Microsoft.AspNetCore.Mvc;
using Shifter.Application.Features.Auth.DTOs;

namespace Shifter.Api.Controllers;

[Route("shifter/v1/auth")]
public class AuthController : Controller
{
    private readonly IMediator _mediator;

    public AuthController(IMediator mediator)
        => _mediator = mediator;

    [HttpPost]
    [Route("user/register")]
    public async Task<ActionResult<AuthResponseDTO>> Login(
        [FromBody] RegisterDTO request,
        CancellationToken ct)
    {
        var result = await _mediator.Send(request, ct);

        return Ok(result);
    }
}