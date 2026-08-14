using Microsoft.EntityFrameworkCore;
using Shifter.Domain.Entities;

namespace Shifter.Infrastructure.Persistence.DbContexts;

public class ShifterDbContext : DbContext
{
    public ShifterDbContext(DbContextOptions<ShifterDbContext> options)
        : base(options) { }
    
    public DbSet<User> Users => Set<User>();
    public DbSet<Day> Days => Set<Day>();
    public DbSet<Shift> Shifts => Set<Shift>();
    
    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.ApplyConfigurationsFromAssembly(typeof(ShifterDbContext).Assembly);
        base.OnModelCreating(modelBuilder);
    } 
}