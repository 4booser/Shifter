using MediatR;
using Shifter.Application.Common.Exceptions;
using Shifter.Application.Features.Auth.DTOs;
using Shifter.Application.Features.Auth.Services.Interfaces;
using Shifter.Domain.Entities;
using Shifter.Infrastructure.Repositories.Interfaces;

namespace Shifter.Application.Features.Auth.Services;

public class LoginHandler : IRequestHandler<LoginDto, AuthResponseDto>
{
    private readonly IAuthTokenIssuer _issuer;
    private readonly IUserQuery _userQuery;
    private readonly ILogger<LoginHandler> _logger;

    public LoginHandler(
        IAuthTokenIssuer issuer,
        IUserQuery userQuery,
        ILogger<LoginHandler> logger)
    {
        _issuer = issuer;
        _userQuery = userQuery;
        _logger = logger;
    }

    public async Task<AuthResponseDto> Handle(LoginDto request, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(request.login) || string.IsNullOrWhiteSpace(request.password))
            throw new ValidationException("Login or password is empty.");
        
        const string AlowedChars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789@._-";

        if (request.login.Length < 4 || request.login.Length > 20)
            throw new ValidationException("Login length must be between 4 and 20 characters.");
        
        if (request.login.Any(c => !AlowedChars.Contains(c)))
            throw new ValidationException("Login must contain only letters, numbers and special characters.");
        
        if (request.password.Length < 8 || request.password.Length > 20)
            throw new ValidationException("Password length must be between 8 and 20 characters.");
        
        if (request.password.Any(c => !AlowedChars.Contains(c)))
            throw new ValidationException("Password must contain only letters, numbers and special characters.");

        User? user = await _userQuery.GetByLoginAsync(request.login, ct);
        
        // One message for both failures: telling them apart would let a caller
        // enumerate which logins exist.
        // A Google-only account has no hash to verify against; the same answer
        // as a wrong password, so nothing is revealed about which it was.
        if (user is null
            || string.IsNullOrEmpty(user.PasswordHash)
            || !BCrypt.Net.BCrypt.Verify(request.password, user.PasswordHash))
        {
            _logger.LogWarning("Failed sign-in attempt for login {Login}.", request.login);
            throw new UnauthorizedException("Invalid login or password.");
        }

        // The password held; the second factor stands between it and tokens.
        if (TwoFactorService.Required(user))
        {
            _logger.LogInformation("User {UserId} passed the password, awaiting the second factor.", user.Id);
            throw new TwoFactorRequiredException(TwoFactorService.IssueTicket(user.Id));
        }

        _logger.LogInformation("User {UserId} signed in.", user.Id);

        return await _issuer.IssueAsync(user.Id, user.Login, ct);
    }
}
