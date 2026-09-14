using MediatR;

namespace Shifter.Application.Features.Account.DTOs;

/// <summary>What the account page shows.</summary>
public record ProfileDto(
    int id,
    string login,
    string first_name,
    string? last_name,
    bool has_password,
    bool google_linked,
    DateTime created_at,
    decimal? monthly_goal,
    string? avatar_kind,
    string? avatar_data,
    string? contact_phone,
    string? contact_telegram,
    string? email,
    /// <summary>The rest between shifts this person counts as enough, in hours.</summary>
    double rest_hours,
    /// <summary>Whether a second factor is on.</summary>
    bool two_factor = false,
    /// <summary>Whether they asked for the month's letter. Off unless they did.</summary>
    bool monthly_letter = false,
    /// <summary>The colours saved to reuse, as "#RRGGBB". Empty until any are.</summary>
    string[]? colour_presets = null,
    /// <summary>Whether this account is a demonstration: invented work, and gone in two days.</summary>
    bool is_demo = false);

public record GetProfileDto(int UserId) : IRequest<ProfileDto>;

/// <summary>The names only; the login is the account's identity and stays put.</summary>
public record UpdateProfileBody(string first_name, string? last_name);

public record UpdateProfileDto(int UserId, string first_name, string? last_name)
    : IRequest<ProfileDto>;

/// <summary>current_password is null only for an account that has never had one — a Google sign-in adding a password for…</summary>
public record ChangePasswordBody(string? current_password, string new_password);

public record ChangePasswordDto(int UserId, string? current_password, string new_password)
    : IRequest<ProfileDto>;

/// <summary>Removes the account and everything hanging off it.</summary>
public record DeleteAccountBody(string? password, string confirm_login);

public record DeleteAccountDto(int UserId, string? password, string confirm_login)
    : IRequest<Unit>;

/// <summary>Detaches Google, which is only allowed once a password exists.</summary>
public record UnlinkGoogleDto(int UserId) : IRequest<ProfileDto>;

/// <summary>Attaches a Google account to the one already signed in, so that afterwards either way of signing in reaches…</summary>
public record LinkGoogleBody(string credential);

public record LinkGoogleDto(int UserId, string credential) : IRequest<ProfileDto>;
