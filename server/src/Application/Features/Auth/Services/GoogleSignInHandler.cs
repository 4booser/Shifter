using Google.Apis.Auth;
using MediatR;
using Shifter.Application.Common.Exceptions;
using Shifter.Application.Features.Auth.DTOs;
using Shifter.Application.Features.Auth.Services.Interfaces;
using Shifter.Domain.Entities;
using Shifter.Infrastructure.Repositories.Interfaces;

namespace Shifter.Application.Features.Auth.Services;

/// <summary>
/// Signs a Google user in, creating the account on first contact. One trip:
/// the browser never sees a separate "register" step, which is the whole point
/// of the button.
/// </summary>
public class GoogleSignInHandler : IRequestHandler<GoogleSignInDto, AuthResponseDto>
{
    /// <summary>
    /// Checks a credential and hands back what Google says about the person.
    /// Shared with account linking so both paths verify identically — a second
    /// copy of this would be the place a validation step quietly goes missing.
    /// </summary>
    public static async Task<GoogleJsonWebSignature.Payload> VerifyAsync(
        string? credential,
        IConfiguration configuration)
    {
        if (string.IsNullOrWhiteSpace(credential))
            throw new ValidationException("Google credential is empty.");

        string? clientId = configuration["Google:ClientId"];

        if (string.IsNullOrWhiteSpace(clientId))
            throw new ForbiddenException("Google sign-in is not configured on this server.");

        try
        {
            return await GoogleJsonWebSignature.ValidateAsync(
                credential,
                new GoogleJsonWebSignature.ValidationSettings { Audience = [clientId] });
        }
        catch (InvalidJwtException)
        {
            throw new UnauthorizedException("Google sign-in could not be verified.");
        }
    }

    private readonly IAuthTokenIssuer _issuer;
    private readonly IUserQuery _userQuery;
    private readonly IUserCommand _userCommand;
    private readonly IConfiguration _configuration;
    private readonly ILogger<GoogleSignInHandler> _logger;

    public GoogleSignInHandler(
        IAuthTokenIssuer issuer,
        IUserQuery userQuery,
        IUserCommand userCommand,
        IConfiguration configuration,
        ILogger<GoogleSignInHandler> logger)
    {
        _issuer = issuer;
        _userQuery = userQuery;
        _userCommand = userCommand;
        _configuration = configuration;
        _logger = logger;
    }

    public async Task<AuthResponseDto> Handle(GoogleSignInDto request, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(request.credential))
            throw new ValidationException("Google credential is empty.");

        string? clientId = _configuration["Google:ClientId"];

        if (string.IsNullOrWhiteSpace(clientId))
            throw new ForbiddenException("Google sign-in is not configured on this server.");

        GoogleJsonWebSignature.Payload payload;

        try
        {
            // Verifies the signature, the issuer, the expiry and that the token
            // was minted for this application rather than someone else's.
            payload = await GoogleJsonWebSignature.ValidateAsync(
                request.credential,
                new GoogleJsonWebSignature.ValidationSettings
                {
                    Audience = [clientId],
                });
        }
        catch (InvalidJwtException exception)
        {
            _logger.LogWarning(exception, "Rejected a Google credential.");

            throw new UnauthorizedException("Google sign-in could not be verified.");
        }

        User? user = await _userQuery.GetByGoogleSubjectAsync(payload.Subject, ct);

        if (user is not null)
        {
            _logger.LogInformation("User {UserId} signed in with Google.", user.Id);

            return await _issuer.IssueAsync(user.Id, user.Login, ct);
        }

        // Names can be absent from a Google profile, so the client asks for them
        // and sends them along on the second attempt.
        string first = Pick(request.first_name, payload.GivenName);
        string last = Pick(request.last_name, payload.FamilyName);

        if (string.IsNullOrWhiteSpace(first))
            throw new ValidationException("First name is required.");

        DateTime now = DateTime.UtcNow;

        User created = new User()
        {
            FirstName = first,
            LastName = string.IsNullOrWhiteSpace(last) ? null : last,
            Login = await UniqueLoginAsync(payload.Email, ct),
            PasswordHash = null,
            GoogleSubject = payload.Subject,
            CreatedAt = now,
            LastLogin = now
        };

        if (! await _userCommand.AddAsync(created, ct))
            throw new ForbiddenException("Can`t add user.");

        _logger.LogInformation("Created user {UserId} from a Google account.", created.Id);

        try
        {
            return await _issuer.IssueAsync(created.Id, created.Login, ct);
        }
        catch
        {
            // Same compensation as password registration: an account with no
            // session is one the person cannot use or re-create.
            await _userCommand.DeleteAsync(created, ct);

            throw;
        }
    }

    private static string Pick(string? typed, string? fromGoogle)
        => string.IsNullOrWhiteSpace(typed) ? fromGoogle?.Trim() ?? string.Empty : typed.Trim();

    /// <summary>
    /// Logins are unique and visible, so the email's local part is used as a
    /// seed and a counter is appended until it is free.
    /// </summary>
    private async Task<string> UniqueLoginAsync(string? email, CancellationToken ct)
    {
        const string allowed = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789@._-";

        string seed = new string((email ?? "user")
            .Split('@')[0]
            .Where(allowed.Contains)
            .ToArray());

        if (seed.Length < 4) seed = $"user{seed}";
        if (seed.Length > 16) seed = seed[..16];

        string candidate = seed;

        for (int suffix = 1; suffix < 1000; suffix++)
        {
            if (await _userQuery.GetByLoginAsync(candidate, ct) is null) return candidate;

            candidate = $"{seed}{suffix}";
        }

        throw new ConflictException("Could not derive a free login.");
    }
}
