using MediatR;
using Shifter.Application.Common.Exceptions;
using Shifter.Application.Features.Auth.DTOs;
using Shifter.Application.Features.Auth.Services.Interfaces;
using Shifter.Domain.Entities;
using Shifter.Infrastructure.Repositories.Interfaces;

namespace Shifter.Application.Features.Auth.Services;

public class RegisterHandler : IRequestHandler<RegisterDto, AuthResponseDto>
{
    private readonly IAuthTokenIssuer _issuer;
    private readonly IUserCommand _userCommand;
    private readonly IUserQuery _userQuery;
    private readonly ILogger<RegisterHandler> _logger;

    public RegisterHandler(
        IAuthTokenIssuer issuer,
        IUserCommand userCommand,
        IUserQuery userQuery,
        ILogger<RegisterHandler> logger)
    {
        _issuer = issuer;
        _userCommand = userCommand;
        _userQuery = userQuery;
        _logger = logger;
    }
    
    public async Task<AuthResponseDto> Handle(RegisterDto request, CancellationToken ct)
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
        
        try
        {
            return await _issuer.IssueAsync(user.Id, user.Login, ct);
        }
        catch
        {
            // Without this the account exists but has no session, and signing
            // up again hits the unique login index: the person is locked out of
            // a name they cannot use or reclaim.
            await _userCommand.DeleteAsync(user, ct);

            throw;
        }
    }
}