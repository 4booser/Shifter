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

public class RegisterHandler : IRequestHandler<RegisterDTO, AuthResponseDTO>
{
    private readonly IJwtService _jwtService;
    private readonly IUserCommand _userCommand;
    private readonly IUserQuery _userQuery;
    private readonly ITokenCommand _tokenCommand;
    private readonly ILogger<RegisterHandler> _logger;
    private readonly IHasher _hasher;
    private readonly TokenOptions _tokenOptions;

    public RegisterHandler(
        IJwtService jwtService,
        IUserCommand userCommand,
        IUserQuery userQuery,
        ITokenCommand tokenCommand,
        ILogger<RegisterHandler> logger,
        IHasher hasher,
        IOptions<TokenOptions> tokenOptions)
    {
        _jwtService = jwtService;
        _userCommand = userCommand;
        _userQuery = userQuery;
        _tokenCommand = tokenCommand;
        _logger = logger;
        _hasher = hasher;
        _tokenOptions = tokenOptions.Value;
    }
    
    public async Task<AuthResponseDTO> Handle(RegisterDTO request, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(request.login) || string.IsNullOrWhiteSpace(request.password))
            throw new ValidationException("Login or password is empty.");
        
        if (string.IsNullOrWhiteSpace(request.first_name) || string.IsNullOrWhiteSpace(request.last_name))
            throw new ValidationException("First name or last name is empty.");
        
        const string AlowedChars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789@._-";

        if (request.login.Length < 4 || request.login.Length > 20)
            throw new ValidationException("Login length must be between 4 and 20 characters.");
        
        if (request.login.Any(c => !AlowedChars.Contains(c)))
            throw new ValidationException("Login must contain only letters, numbers and special characters.");
        
        if (request.password.Length < 8 || request.password.Length > 20)
            throw new ValidationException("Password length must be between 8 and 20 characters.");
        
        if (request.password.Any(c => !AlowedChars.Contains(c)))
            throw new ValidationException("Password must contain only letters, numbers and special characters.");
        
        
        DateTime now = DateTime.UtcNow;
        
        User user = new User()
        {
            FirstName = request.first_name,
            LastName = request.last_name,
            Login = request.login,
            PasswordHash = BCrypt.Net.BCrypt.HashPassword(request.password),
            CreatedAt = now,
            LastLogin = now
        };
        
        if (await _userQuery.GetByLoginAsync(user.Login, ct) != null)
            throw new ConflictException("User with this login already exists.");
        
        if (! await _userCommand.AddAsync(user, ct))
            throw new ForbiddenException("Can`t add user.");
        
        _logger.LogInformation("User {UserId} registered with login {Login}.", user.Id, user.Login);
        
        Claim[] claims =
        {
            new Claim(ClaimTypes.NameIdentifier, user.Id.ToString()),
            new Claim(ClaimTypes.Name, user.Login)
        };
        
        string accessToken = _jwtService.GenerateAccessToken(claims);
        string refreshToken = _hasher.Hash(_jwtService.GenerateRefreshToken());

        // The two tokens expire on different schedules: the access token must
        // match what JwtService stamped into the JWT, while the stored refresh
        // token is what keeps the session alive after that.
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

        return new AuthResponseDTO(
            accessToken,
            refreshToken,
            accessExpires
        );
    }
}