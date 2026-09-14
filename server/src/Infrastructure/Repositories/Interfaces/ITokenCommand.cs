using Shifter.Domain.Entities;

namespace Shifter.Infrastructure.Repositories.Interfaces;

public interface ITokenCommand
{
    public Task<bool> AddAsync(JwtToken token, CancellationToken ct);

    /// <summary>Spends a refresh token.</summary>
    public Task RevokeAsync(JwtToken token, CancellationToken ct);

    /// <summary>Kills every session the user has.</summary>
    public Task<int> RevokeAllAsync(int userId, CancellationToken ct);

    /// <summary>Clears rows that can no longer be presented or investigated.</summary>
    public Task DeleteExpiredAsync(int userId, CancellationToken ct);
}
