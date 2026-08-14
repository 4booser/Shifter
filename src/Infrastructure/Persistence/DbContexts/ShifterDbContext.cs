using Microsoft.EntityFrameworkCore;
using Shifter.Domain.Entities;

namespace Shifter.Infrastructure.Persistence.DbContexts;

public class ShifterDbContext : DbContext
{
    public ShifterDbContext(DbContextOptions<ShifterDbContext> options)
        : base(options) { }
    
    public DbSet<User> Users => Set<User>();
    
    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.ApplyConfigurationsFromAssembly(typeof(ShifterDbContext).Assembly);
        base.OnModelCreating(modelBuilder);
    } 
}