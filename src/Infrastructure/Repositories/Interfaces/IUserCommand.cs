using Shifter.Domain.Entities;

namespace Shifter.Infrastructure.Repositories.Interfaces;

public interface IUserCommand
{
    public Task<bool> AddAsync(User user, CancellationToken ct);

    /// <summary>
    /// Undoes a registration whose token could not be stored. The user and the
    /// token live in separate databases, so there is no transaction spanning
    /// both and the first write has to be taken back by hand.
    /// </summary>
    public Task DeleteAsync(User user, CancellationToken ct);
}