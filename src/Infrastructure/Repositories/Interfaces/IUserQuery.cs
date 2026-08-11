using Shifter.Domain.Entities;

namespace Shifter.Infrastructure.Repositories.Interfaces;

public interface IUserQuery
{
    public Task<User?> GetByLoginAsync(string login, CancellationToken ct);
}