using Shifter.Domain.Entities;

namespace Shifter.Infrastructure.Repositories.Interfaces;

public interface ITokenQuery
{
    /// <summary>
    /// Looks a refresh token up by the hash of the value the client presented.
    /// The raw token is never stored, so this is the only way in.
    /// </summary>
    public Task<JwtToken?> GetByHashAsync(string hash, CancellationToken ct);
}
