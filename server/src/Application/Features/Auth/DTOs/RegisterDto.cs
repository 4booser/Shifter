using MediatR;

namespace Shifter.Application.Features.Auth.DTOs;

public record RegisterDto(
    string login,
    string password,
    string first_name,
    string? last_name,
    /// <summary>Whoever's invite link brought them here; ignored when unknown.</summary>
    string? referral = null
    ) : IRequest<AuthResponseDto>;