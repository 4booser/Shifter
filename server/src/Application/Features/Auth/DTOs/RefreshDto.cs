using MediatR;

namespace Shifter.Application.Features.Auth.DTOs;

public record RefreshDto(
    string refresh_token
    ) : IRequest<AuthResponseDto>;
