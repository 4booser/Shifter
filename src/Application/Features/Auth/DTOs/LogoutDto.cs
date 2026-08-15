using MediatR;

namespace Shifter.Application.Features.Auth.DTOs;

/// <summary>
/// Ends a session. The refresh token identifies which one; without it there is
/// nothing to revoke, since the access token is stateless and simply expires.
/// </summary>
public record LogoutDto(string? refresh_token) : IRequest<LogoutResultDto>;

/// <summary>Ends every session the caller has, on every device.</summary>
public record LogoutEverywhereDto(int UserId) : IRequest<LogoutResultDto>;

public record LogoutResultDto(int revoked);
