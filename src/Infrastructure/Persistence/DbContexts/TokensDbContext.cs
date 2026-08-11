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
        base.OnModelCreating(modelBuilder);
    } 
    
    
}