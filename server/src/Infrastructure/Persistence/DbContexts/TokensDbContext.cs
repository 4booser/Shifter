using Microsoft.EntityFrameworkCore;
using Shifter.Domain.Entities;

namespace Shifter.Infrastructure.Persistence.DbContexts;

public class TokensDbContext : DbContext
{
    public TokensDbContext(DbContextOptions<TokensDbContext> options)
        : base(options) { }
    
    public DbSet<JwtToken> Tokens => Set<JwtToken>();
    
    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.ApplyConfigurationsFromAssembly(typeof(TokensDbContext).Assembly);

        // Refresh is a lookup by hash on every session renewal, so this is the
        // hot path. Unique because two rows can never hold the same secret.
        modelBuilder.Entity<JwtToken>()
            .HasIndex(token => token.Token)
            .IsUnique();

        // Expiry sweeps filter on this pair.
        modelBuilder.Entity<JwtToken>()
            .HasIndex(token => new { token.UserId, token.ExpiresAt });

        base.OnModelCreating(modelBuilder);
    }
}