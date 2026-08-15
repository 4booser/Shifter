using Microsoft.EntityFrameworkCore;
using Shifter.Domain.Entities;
using Shifter.Infrastructure.Persistence.DbContexts;
using Shifter.Infrastructure.Repositories.Interfaces;

namespace Shifter.Infrastructure.Repositories.Queries;

public class TokenQuery : ITokenQuery
{
    private readonly TokensDbContext _db;

    public TokenQuery(TokensDbContext db)
        => _db = db;

    public async Task<JwtToken?> GetByHashAsync(string hash, CancellationToken ct)
    {
        // Tracked on purpose: the caller deletes this row to rotate the token.
        return await _db.Tokens.FirstOrDefaultAsync(token => token.Token == hash, ct);
    }
}
