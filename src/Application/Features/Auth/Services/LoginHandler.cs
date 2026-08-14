using System.Security.Claims;
using MediatR;
using Microsoft.Extensions.Options;
using Shifter.Application.Common.Exceptions;
using Shifter.Application.Common.Options;
using Shifter.Application.Features.Auth.DTOs;
using Shifter.Application.Features.Auth.Services.Interfaces;
using Shifter.Domain.Entities;
using Shifter.Infrastructure.Repositories.Interfaces;

namespace Shifter.Application.Features.Auth.Services;

public class LoginHandler : IRequestHandler<LoginDto, AuthResponseDto>
{
    private readonly IJwtService _jwtService;
    private readonly IUserQuery _userQuery;
    private readonly ITokenCommand _tokenCommand;
    private readonly ILogger<LoginHandler> _logger;
    private readonly IHasher _hasher;
    private readonly TokenOptions _tokenOptions;

    public LoginHandler(
        IJwtService jwtService,
        IUserQuery userQuery,
        ITokenCommand tokenCommand,
        ILogger<LoginHandler> logger,
        IHasher hasher,
        IOptions<TokenOptions> tokenOptions)
    {
        _jwtService = jwtService;
        _userQuery = userQuery;
        _tokenCommand = tokenCommand;
        _logger = logger;
        _hasher = hasher;
        _tokenOptions = tokenOptions.Value;
    }

    public async Task<AuthResponseDto> Handle(LoginDto request, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(request.login) || string.IsNullOrWhiteSpace(request.password))
            throw new ValidationException("Login or password is empty.");

        User? user = await _userQuery.GetByLoginAsync(request.login, ct);

        // One message for both failures: telling them apart would let a caller
        // enumerate which logins exist.
        if (user is null || !BCrypt.Net.BCrypt.Verify(request.password, user.PasswordHash))
        {
            _logger.LogWarning("Failed sign-in attempt for login {Login}.", request.login);

            throw new UnauthorizedException("Invalid login or password.");
        }

        _logger.LogInformation("User {UserId} signed in.", user.Id);

        DateTime now = DateTime.UtcNow;

        Claim[] claims =
        {
            new Claim(ClaimTypes.NameIdentifier, user.Id.ToString()),
            new Claim(ClaimTypes.Name, user.Login)
        };

        string accessToken = _jwtService.GenerateAccessToken(claims);
        string refreshToken = _hasher.Hash(_jwtService.GenerateRefreshToken());

        DateTime accessExpires = now.AddMinutes(_tokenOptions.AccessTokenLifetimeMinutes);
        DateTime refreshExpires = now.AddDays(_tokenOptions.RefreshTokenLifetimeDays);

        JwtToken token = new JwtToken()
        {
            UserId = user.Id,
            Token = refreshToken,
            ExpiresAt = refreshExpires
        };

        if (! await _tokenCommand.AddAsync(token, ct))
            throw new ForbiddenException("Can`t add token.");

        return new AuthResponseDto(
            accessToken,
            refreshToken,
            accessExpires
        );
    }
}
