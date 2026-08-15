using Shifter.Application.Features.Auth.DTOs;

namespace Shifter.Application.Features.Auth.Services.Interfaces;

/// <summary>
/// Single place that mints a session. Register, login and refresh all go
/// through here so the storage rules cannot drift between them.
/// </summary>
public interface IAuthTokenIssuer
{
    Task<AuthResponseDto> IssueAsync(int userId, string login, CancellationToken ct);
}
