using MediatR;

namespace Shifter.Application.Features.Auth.DTOs;

public record RegisterDTO(
    string login,
    string password,
    string first_name,
    string? last_name
    ) : IRequest<AuthResponseDTO>;