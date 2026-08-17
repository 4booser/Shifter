using MediatR;

namespace Shifter.Application.Features.Auth.DTOs;

/// <summary>
/// The ID token Google Identity Services hands the browser, plus the names to
/// use if Google did not supply them and the user typed them in.
/// </summary>
public record GoogleSignInDto(
    string credential,
    string? first_name,
    string? last_name
    ) : IRequest<AuthResponseDto>;
