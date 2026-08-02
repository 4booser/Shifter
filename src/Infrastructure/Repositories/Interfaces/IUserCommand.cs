using Shifter.Domain.Entities;

namespace Shifter.Infrastructure.Repositories.Interfaces;

public interface IUserCommand
{
    public Task<bool> AddAsync(User user, CancellationToken ct);
}