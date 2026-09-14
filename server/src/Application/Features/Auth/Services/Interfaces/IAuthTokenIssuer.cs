using Shifter.Application.Features.Auth.DTOs;

namespace Shifter.Application.Features.Auth.Services.Interfaces;

/// <summary>Single place that mints a session.</summary>
public interface IAuthTokenIssuer
{
    Task<AuthResponseDto> IssueAsync(int userId, string login, CancellationToken ct);
}
