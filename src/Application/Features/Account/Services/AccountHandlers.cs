using MediatR;
using Shifter.Application.Common.Exceptions;
using Shifter.Application.Features.Account.DTOs;
using Shifter.Domain.Entities;
using Shifter.Infrastructure.Repositories.Interfaces;

namespace Shifter.Application.Features.Account.Services;

/// <summary>
/// Everything the account page can do. Each handler takes the user id from the
/// request record, which the controller fills from the token — never from the
/// body, or one account could edit another.
/// </summary>
public static class AccountRules
{
    public const int NameMaxLength = 60;
    public const int PasswordMinLength = 8;

    public static ProfileDto ToDto(User user) => new ProfileDto(
        user.Id,
        user.Login,
        user.FirstName,
        user.LastName,
        user.PasswordHash is not null,
        user.GoogleSubject is not null,
        user.CreatedAt,
        user.MonthlyGoal);

    public static string RequireName(string? value, string field)
    {
        if (string.IsNullOrWhiteSpace(value))
            throw new ValidationException($"{field} is empty.");

        if (value.Trim().Length > NameMaxLength)
            throw new ValidationException($"{field} must be at most {NameMaxLength} characters.");

        return value.Trim();
    }
}

public class GetProfileHandler : IRequestHandler<GetProfileDto, ProfileDto>
{
    private readonly IUserQuery _users;

    public GetProfileHandler(IUserQuery users) => _users = users;

    public async Task<ProfileDto> Handle(GetProfileDto request, CancellationToken ct)
    {
        User user = await _users.GetByIdAsync(request.UserId, ct)
            ?? throw new UnauthorizedException("This account no longer exists.");

        return AccountRules.ToDto(user);
    }
}

public class UpdateProfileHandler : IRequestHandler<UpdateProfileDto, ProfileDto>
{
    private readonly IUserQuery _users;
    private readonly IUserCommand _command;

    public UpdateProfileHandler(IUserQuery users, IUserCommand command)
    {
        _users = users;
        _command = command;
    }

    public async Task<ProfileDto> Handle(UpdateProfileDto request, CancellationToken ct)
    {
        User user = await _users.GetForUpdateAsync(request.UserId, ct)
            ?? throw new UnauthorizedException("This account no longer exists.");

        user.FirstName = AccountRules.RequireName(request.first_name, "First name");
        user.LastName = string.IsNullOrWhiteSpace(request.last_name)
            ? null
            : AccountRules.RequireName(request.last_name, "Last name");

        await _command.SaveAsync(ct);

        return AccountRules.ToDto(user);
    }
}

public class ChangePasswordHandler : IRequestHandler<ChangePasswordDto, ProfileDto>
{
    private readonly IUserQuery _users;
    private readonly IUserCommand _command;
    private readonly ITokenCommand _tokens;
    private readonly ILogger<ChangePasswordHandler> _logger;

    public ChangePasswordHandler(
        IUserQuery users,
        IUserCommand command,
        ITokenCommand tokens,
        ILogger<ChangePasswordHandler> logger)
    {
        _users = users;
        _command = command;
        _tokens = tokens;
        _logger = logger;
    }

    public async Task<ProfileDto> Handle(ChangePasswordDto request, CancellationToken ct)
    {
        User user = await _users.GetForUpdateAsync(request.UserId, ct)
            ?? throw new UnauthorizedException("This account no longer exists.");

        if (string.IsNullOrWhiteSpace(request.new_password)
            || request.new_password.Length < AccountRules.PasswordMinLength)
        {
            throw new ValidationException(
                $"New password must be at least {AccountRules.PasswordMinLength} characters.");
        }

        // An account that already has a password must prove it knows the old
        // one: a stolen access token should not be enough to take the account.
        if (user.PasswordHash is not null)
        {
            if (string.IsNullOrEmpty(request.current_password)
                || !BCrypt.Net.BCrypt.Verify(request.current_password, user.PasswordHash))
            {
                throw new UnauthorizedException("Current password is wrong.");
            }
        }

        user.PasswordHash = BCrypt.Net.BCrypt.HashPassword(request.new_password);

        await _command.SaveAsync(ct);

        // Changing a password is what people do when they think someone else
        // is in the account, so every other session goes with it.
        int revoked = await _tokens.RevokeAllAsync(user.Id, ct);

        _logger.LogInformation(
            "User {UserId} changed their password; {Count} sessions revoked.",
            user.Id,
            revoked);

        return AccountRules.ToDto(user);
    }
}

public class UnlinkGoogleHandler : IRequestHandler<UnlinkGoogleDto, ProfileDto>
{
    private readonly IUserQuery _users;
    private readonly IUserCommand _command;

    public UnlinkGoogleHandler(IUserQuery users, IUserCommand command)
    {
        _users = users;
        _command = command;
    }

    public async Task<ProfileDto> Handle(UnlinkGoogleDto request, CancellationToken ct)
    {
        User user = await _users.GetForUpdateAsync(request.UserId, ct)
            ?? throw new UnauthorizedException("This account no longer exists.");

        if (user.GoogleSubject is null)
            throw new ValidationException("This account is not linked to Google.");

        // Unlinking without a password would leave no way back in at all.
        if (user.PasswordHash is null)
            throw new ConflictException("Set a password before unlinking Google.");

        user.GoogleSubject = null;

        await _command.SaveAsync(ct);

        return AccountRules.ToDto(user);
    }
}

public class DeleteAccountHandler : IRequestHandler<DeleteAccountDto, Unit>
{
    private readonly IUserQuery _users;
    private readonly IUserCommand _command;
    private readonly ITokenCommand _tokens;
    private readonly ILogger<DeleteAccountHandler> _logger;

    public DeleteAccountHandler(
        IUserQuery users,
        IUserCommand command,
        ITokenCommand tokens,
        ILogger<DeleteAccountHandler> logger)
    {
        _users = users;
        _command = command;
        _tokens = tokens;
        _logger = logger;
    }

    public async Task<Unit> Handle(DeleteAccountDto request, CancellationToken ct)
    {
        User user = await _users.GetForUpdateAsync(request.UserId, ct)
            ?? throw new UnauthorizedException("This account no longer exists.");

        // Typing the login out is the guard against a mis-click; the password,
        // where there is one, is the guard against someone else's mis-click.
        if (!string.Equals(request.confirm_login, user.Login, StringComparison.Ordinal))
            throw new ValidationException("Type your login exactly to confirm.");

        if (user.PasswordHash is not null
            && (string.IsNullOrEmpty(request.password)
                || !BCrypt.Net.BCrypt.Verify(request.password, user.PasswordHash)))
        {
            throw new UnauthorizedException("Password is wrong.");
        }

        // Sessions first: if the delete fails the account is at least locked,
        // and if it succeeds there is nothing left for a token to reach.
        await _tokens.RevokeAllAsync(user.Id, ct);
        await _command.DeleteAsync(user, ct);

        _logger.LogInformation("User {UserId} deleted their account.", user.Id);

        return Unit.Value;
    }
}
