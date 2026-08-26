using System.Security.Claims;
using Microsoft.Extensions.Options;
using Shifter.Application.Common.Exceptions;
using Shifter.Application.Common.Options;
using Shifter.Application.Features.Auth.DTOs;
using Shifter.Application.Features.Auth.Services.Interfaces;
using Shifter.Domain.Entities;
using Microsoft.AspNetCore.Http;
using Shifter.Infrastructure.Repositories.Interfaces;

namespace Shifter.Application.Features.Auth.Services;

public class AuthTokenIssuer : IAuthTokenIssuer
{
    private readonly IJwtService _jwtService;
    private readonly ITokenCommand _tokenCommand;
    private readonly IHasher _hasher;
    private readonly TokenOptions _tokenOptions;
    private readonly IHttpContextAccessor? _httpContext;

    public AuthTokenIssuer(
        IJwtService jwtService,
        ITokenCommand tokenCommand,
        IHasher hasher,
        IOptions<TokenOptions> tokenOptions,
        IHttpContextAccessor? httpContext = null)
    {
        _jwtService = jwtService;
        _tokenCommand = tokenCommand;
        _hasher = hasher;
        _tokenOptions = tokenOptions.Value;
        _httpContext = httpContext;
    }

    public async Task<AuthResponseDto> IssueAsync(
        int userId,
        string login,
        CancellationToken ct)
    {
        DateTime now = DateTime.UtcNow;

        Claim[] claims =
        {
            new Claim(ClaimTypes.NameIdentifier, userId.ToString()),
            new Claim(ClaimTypes.Name, login)
        };

        string accessToken = _jwtService.GenerateAccessToken(claims);

        // The caller receives the raw secret and the database keeps only its
        // hash. Previously the stored value and the returned value were the
        // same string, which made the hashing decorative: anyone reading the
        // token table could replay the rows against the API.
        string refreshToken = _jwtService.GenerateRefreshToken();

        DateTime accessExpires = now.AddMinutes(_tokenOptions.AccessTokenLifetimeMinutes);
        DateTime refreshExpires = now.AddDays(_tokenOptions.RefreshTokenLifetimeDays);

        // Which browser this session belongs to, for the devices list. Best
        // effort: a missing header is a missing label, nothing more.
        string? userAgent = _httpContext?.HttpContext?.Request.Headers.UserAgent.ToString();

        JwtToken stored = new JwtToken()
        {
            UserId = userId,
            Token = _hasher.Hash(refreshToken),
            ExpiresAt = refreshExpires,
            UserAgent = string.IsNullOrWhiteSpace(userAgent) ? null : userAgent[..Math.Min(300, userAgent.Length)]
        };

        if (! await _tokenCommand.AddAsync(stored, ct))
            throw new ForbiddenException("Can`t add token.");

        // Expired rows for this user are dropped on the way through, so the
        // table does not grow without bound.
        await _tokenCommand.DeleteExpiredAsync(userId, ct);

        return new AuthResponseDto(accessToken, refreshToken, accessExpires);
    }
}
