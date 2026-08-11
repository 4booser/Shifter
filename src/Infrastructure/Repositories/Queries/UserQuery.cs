using Microsoft.EntityFrameworkCore;
using Shifter.Domain.Entities;
using Shifter.Infrastructure.Persistence.DbContexts;
using Shifter.Infrastructure.Repositories.Interfaces;

namespace Shifter.Infrastructure.Repositories.Queries;

public class UserQuery : IUserQuery
{
    private readonly ShifterDbContext _db;
    
    public UserQuery(ShifterDbContext db)
        => _db = db;

    public async Task<User?> GetByLoginAsync(string login, CancellationToken ct)
    {
        return await _db.Users.FirstOrDefaultAsync(u => u.Login == login, ct);
    } 
}