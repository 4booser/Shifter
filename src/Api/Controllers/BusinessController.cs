using MediatR;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace Shifter.Api.Controllers;

[Authorize]
[Route("shifter/v1/auth")]


public class BusinessController
{
    private readonly IMediator _mediator;

    public BusinessController(IMediator mediator)
        => _mediator = mediator;

}