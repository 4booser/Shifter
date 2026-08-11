using Shifter.Domain.Entities;

namespace Shifter.Infrastructure.Repositories.Interfaces;

public interface ITokenCommand 
{
    public Task<bool> AddAsync(JwtToken token, CancellationToken ct);
}