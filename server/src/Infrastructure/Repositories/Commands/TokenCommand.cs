using Microsoft.EntityFrameworkCore;
using Shifter.Domain.Entities;
using Shifter.Infrastructure.Persistence.DbContexts;
using Shifter.Infrastructure.Repositories.Interfaces;

namespace Shifter.Infrastructure.Repositories.Commands;

public class TokenCommand : ITokenCommand
{
    /// <summary>
    /// How long a spent token is kept. Long enough that a replay arriving after
    /// the client has moved on is still recognised for what it is.
    /// </summary>
    private static readonly TimeSpan RevokedRetention = TimeSpan.FromDays(30);

    private readonly TokensDbContext _db;

    public TokenCommand(TokensDbContext db)
        => _db = db;

    public async Task<bool> AddAsync(JwtToken token, CancellationToken ct)
    {
        await _db.AddAsync(token, ct);
        return await _db.SaveChangesAsync(ct) > 0;
    }

    public async Task RevokeAsync(JwtToken token, CancellationToken ct)
    {
        token.Revoke(DateTime.UtcNow);

        await _db.SaveChangesAsync(ct);
    }

    public async Task<int> RevokeAllAsync(int userId, CancellationToken ct)
    {
        DateTime now = DateTime.UtcNow;

        return await _db.Tokens
            .Where(token => token.UserId == userId && token.RevokedAt == null)
            .ExecuteUpdateAsync(
                setters => setters.SetProperty(token => token.RevokedAt, now),
                ct);
    }

    public async Task DeleteExpiredAsync(int userId, CancellationToken ct)
    {
        DateTime now = DateTime.UtcNow;
        DateTime cutoff = now - RevokedRetention;

        await _db.Tokens
            .Where(token => token.UserId == userId
                && token.ExpiresAt <= now
                && (token.RevokedAt == null || token.RevokedAt <= cutoff))
            .ExecuteDeleteAsync(ct);
    }
}
