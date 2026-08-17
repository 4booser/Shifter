using MediatR;

namespace Shifter.Application.Features.Auth.DTOs;

public record LoginDto(
    string login,
    string password
    ) : IRequest<AuthResponseDto>;
