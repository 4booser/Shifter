using Microsoft.EntityFrameworkCore;
using Shifter.Domain.Entities;
using Shifter.Infrastructure.Persistence.DbContexts;
using Shifter.Infrastructure.Repositories.Interfaces;

namespace Shifter.Infrastructure.Repositories.Commands;

public class TokenCommand : ITokenCommand
{
    private readonly TokensDbContext _db;

    public TokenCommand(TokensDbContext db)
        => _db = db;

    public async Task<bool> AddAsync(JwtToken token, CancellationToken ct)
    {
        await _db.AddAsync(token, ct);
        return await _db.SaveChangesAsync(ct) > 0;
    }

    public async Task DeleteAsync(JwtToken token, CancellationToken ct)
    {
        _db.Tokens.Remove(token);
        await _db.SaveChangesAsync(ct);
    }

    public async Task DeleteExpiredAsync(int userId, CancellationToken ct)
    {
        await _db.Tokens
            .Where(token => token.UserId == userId && token.ExpiresAt <= DateTime.UtcNow)
            .ExecuteDeleteAsync(ct);
    }
}
