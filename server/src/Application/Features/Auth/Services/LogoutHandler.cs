using MediatR;
using Shifter.Application.Features.Auth.DTOs;
using Shifter.Application.Features.Auth.Services.Interfaces;
using Shifter.Domain.Entities;
using Shifter.Infrastructure.Repositories.Interfaces;

namespace Shifter.Application.Features.Auth.Services;

/// <summary>
/// Signing out revokes the refresh token so it cannot be traded for a new pair.
/// The access token still works until it expires — that is the price of a
/// stateless token, and the lifetime is short for exactly this reason.
/// </summary>
public class LogoutHandler : IRequestHandler<LogoutDto, LogoutResultDto>
{
    private readonly ITokenQuery _tokenQuery;
    private readonly ITokenCommand _tokenCommand;
    private readonly IHasher _hasher;
    private readonly ILogger<LogoutHandler> _logger;

    public LogoutHandler(
        ITokenQuery tokenQuery,
        ITokenCommand tokenCommand,
        IHasher hasher,
        ILogger<LogoutHandler> logger)
    {
        _tokenQuery = tokenQuery;
        _tokenCommand = tokenCommand;
        _hasher = hasher;
        _logger = logger;
    }

    public async Task<LogoutResultDto> Handle(LogoutDto request, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(request.refresh_token))
            return new LogoutResultDto(0);

        JwtToken? stored = await _tokenQuery.GetByHashAsync(
            _hasher.Hash(request.refresh_token), ct);

        // An unknown or already-spent token is not an error: signing out twice,
        // or after the session lapsed, should still leave the client signed out.
        if (stored is null || stored.RevokedAt is not null)
            return new LogoutResultDto(0);

        await _tokenCommand.RevokeAsync(stored, ct);

        _logger.LogInformation("User {UserId} signed out.", stored.UserId);

        return new LogoutResultDto(1);
    }
}

public class LogoutEverywhereHandler : IRequestHandler<LogoutEverywhereDto, LogoutResultDto>
{
    private readonly ITokenCommand _tokenCommand;
    private readonly ILogger<LogoutEverywhereHandler> _logger;

    public LogoutEverywhereHandler(
        ITokenCommand tokenCommand,
        ILogger<LogoutEverywhereHandler> logger)
    {
        _tokenCommand = tokenCommand;
        _logger = logger;
    }

    public async Task<LogoutResultDto> Handle(LogoutEverywhereDto request, CancellationToken ct)
    {
        int revoked = await _tokenCommand.RevokeAllAsync(request.UserId, ct);

        _logger.LogInformation(
            "User {UserId} signed out everywhere; {Count} sessions revoked.",
            request.UserId,
            revoked);

        return new LogoutResultDto(revoked);
    }
}
