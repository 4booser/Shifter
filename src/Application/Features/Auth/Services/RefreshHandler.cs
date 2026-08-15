using MediatR;
using Shifter.Application.Common.Exceptions;
using Shifter.Application.Features.Auth.DTOs;
using Shifter.Application.Features.Auth.Services.Interfaces;
using Shifter.Domain.Entities;
using Shifter.Infrastructure.Repositories.Interfaces;

namespace Shifter.Application.Features.Auth.Services;

public class RefreshHandler : IRequestHandler<RefreshDto, AuthResponseDto>
{
    private readonly IAuthTokenIssuer _issuer;
    private readonly ITokenQuery _tokenQuery;
    private readonly ITokenCommand _tokenCommand;
    private readonly IUserQuery _userQuery;
    private readonly IHasher _hasher;
    private readonly ILogger<RefreshHandler> _logger;

    public RefreshHandler(
        IAuthTokenIssuer issuer,
        ITokenQuery tokenQuery,
        ITokenCommand tokenCommand,
        IUserQuery userQuery,
        IHasher hasher,
        ILogger<RefreshHandler> logger)
    {
        _issuer = issuer;
        _tokenQuery = tokenQuery;
        _tokenCommand = tokenCommand;
        _userQuery = userQuery;
        _hasher = hasher;
        _logger = logger;
    }

    public async Task<AuthResponseDto> Handle(RefreshDto request, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(request.refresh_token))
            throw new ValidationException("Refresh token is empty.");

        JwtToken? stored = await _tokenQuery.GetByHashAsync(
            _hasher.Hash(request.refresh_token), ct);

        // Unknown and expired get the same answer: a caller probing for valid
        // tokens learns nothing from the difference.
        if (stored is null)
        {
            _logger.LogWarning("Refresh attempted with an unknown token.");

            throw new UnauthorizedException("Refresh token is invalid or expired.");
        }

        // A second use of a token that was already spent means the value
        // reached someone it should not have: the legitimate client has one
        // rotation ahead of it, so every session for this user is dropped and
        // both parties are made to sign in again.
        if (stored.RevokedAt is not null)
        {
            int killed = await _tokenCommand.RevokeAllAsync(stored.UserId, ct);

            _logger.LogWarning(
                "Refresh token replayed for user {UserId}; revoked {Count} sessions.",
                stored.UserId,
                killed);

            throw new UnauthorizedException("Refresh token is invalid or expired.");
        }

        if (stored.ExpiresAt <= DateTime.UtcNow)
        {
            _logger.LogWarning("Refresh attempted with an expired token.");

            throw new UnauthorizedException("Refresh token is invalid or expired.");
        }

        User? user = await _userQuery.GetByIdAsync(stored.UserId, ct);

        if (user is null)
            throw new UnauthorizedException("Refresh token is invalid or expired.");

        // Rotation: the presented token is spent before a new one is minted, so
        // a stolen copy stops working the moment the real client refreshes.
        await _tokenCommand.RevokeAsync(stored, ct);

        _logger.LogInformation("User {UserId} refreshed their session.", user.Id);

        return await _issuer.IssueAsync(user.Id, user.Login, ct);
    }
}
