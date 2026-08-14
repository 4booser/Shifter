using MediatR;

namespace Shifter.Application.Features.Auth.DTOs;

public record RegisterDto(
    string login,
    string password,
    string first_name,
    string? last_name
    ) : IRequest<AuthResponseDto>;