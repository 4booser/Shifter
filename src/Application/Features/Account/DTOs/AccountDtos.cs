using MediatR;

namespace Shifter.Application.Features.Account.DTOs;

/// <summary>
/// What the account page shows. has_password and google_linked drive which
/// controls it offers: someone who only ever used Google has no password to
/// change, they have one to set.
/// </summary>
public record ProfileDto(
    int id,
    string login,
    string first_name,
    string? last_name,
    bool has_password,
    bool google_linked,
    DateTime created_at,
    decimal? monthly_goal);

public record GetProfileDto(int UserId) : IRequest<ProfileDto>;

/// <summary>The names only; the login is the account's identity and stays put.</summary>
public record UpdateProfileBody(string first_name, string? last_name);

public record UpdateProfileDto(int UserId, string first_name, string? last_name)
    : IRequest<ProfileDto>;

/// <summary>
/// current_password is null only for an account that has never had one — a
/// Google sign-in adding a password for the first time.
/// </summary>
public record ChangePasswordBody(string? current_password, string new_password);

public record ChangePasswordDto(int UserId, string? current_password, string new_password)
    : IRequest<ProfileDto>;

/// <summary>
/// Removes the account and everything hanging off it. The password confirms
/// intent where there is one; Google-only accounts confirm with their login.
/// </summary>
public record DeleteAccountBody(string? password, string confirm_login);

public record DeleteAccountDto(int UserId, string? password, string confirm_login)
    : IRequest<Unit>;

/// <summary>Detaches Google, which is only allowed once a password exists.</summary>
public record UnlinkGoogleDto(int UserId) : IRequest<ProfileDto>;
