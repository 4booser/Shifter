using Shifter.Domain.Entities;

namespace Shifter.Infrastructure.Repositories.Interfaces;

public interface IUserQuery
{
    public Task<User?> GetByLoginAsync(string login, CancellationToken ct);
    public Task<User?> GetByIdAsync(int id, CancellationToken ct);
    public Task<User?> GetByGoogleSubjectAsync(string subject, CancellationToken ct);

    /// <summary>
    /// Tracked, for the handlers that change the account. GetByIdAsync reads
    /// without tracking, so edits made to what it returns are never saved.
    /// </summary>
    public Task<User?> GetForUpdateAsync(int id, CancellationToken ct);
}
