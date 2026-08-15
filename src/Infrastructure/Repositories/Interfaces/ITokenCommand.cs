using Shifter.Domain.Entities;

namespace Shifter.Infrastructure.Repositories.Interfaces;

public interface ITokenCommand
{
    public Task<bool> AddAsync(JwtToken token, CancellationToken ct);

    /// <summary>Spends a refresh token so it cannot be replayed.</summary>
    public Task DeleteAsync(JwtToken token, CancellationToken ct);

    public Task DeleteExpiredAsync(int userId, CancellationToken ct);
}
