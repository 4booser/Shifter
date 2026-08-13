using MediatR;

namespace Shifter.Application.Features.Auth.DTOs;

public record LoginDTO(
    string login,
    string password
    ) : IRequest<AuthResponseDTO>;
