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
    public DbSet<Sales> Sales => Set<Sales>();
    public DbSet<DaySale> DaySales => Set<DaySale>();
    public DbSet<DayShift> DayShifts => Set<DayShift>();
    public DbSet<Payout> Payouts => Set<Payout>();
    public DbSet<Location> Locations => Set<Location>();
    public DbSet<Team> Teams => Set<Team>();
    public DbSet<TeamMember> TeamMembers => Set<TeamMember>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.ApplyConfigurationsFromAssembly(typeof(ShifterDbContext).Assembly);

        // The registration check and the insert are separate operations, so
        // without this two simultaneous sign-ups could both claim one login.
        modelBuilder.Entity<User>()
            .HasIndex(user => user.Login)
            .IsUnique();

        // One Shifter account per Google account. Filtered so the many users
        // without one do not all collide on NULL.
        modelBuilder.Entity<User>()
            .HasIndex(user => user.GoogleSubject)
            .IsUnique()
            .HasFilter("\"GoogleSubject\" IS NOT NULL");

        // A user has at most one row per date. The day endpoint upserts on this
        // pair, so a duplicate would silently split one day into two.
        modelBuilder.Entity<Day>()
            .HasIndex(day => new { day.UserId, day.Date })
            .IsUnique();

        // The same position recorded twice on one day would double-count.
        modelBuilder.Entity<DaySale>()
            .HasIndex(entry => new { entry.DayId, entry.SalesId })
            .IsUnique();

        // Likewise for a template placed twice on one day.
        modelBuilder.Entity<DayShift>()
            .HasIndex(entry => new { entry.DayId, entry.ShiftId })
            .IsUnique();

        // The join code is how people get in, so it has to be unique.
        modelBuilder.Entity<Team>()
            .HasIndex(team => team.InviteCode)
            .IsUnique();

        // One membership per person per team; joining twice would double them
        // on the rota.
        modelBuilder.Entity<TeamMember>()
            .HasIndex(member => new { member.TeamId, member.UserId })
            .IsUnique();

        // Deleting an account takes its memberships with it, but never the
        // teams other people are still using.
        modelBuilder.Entity<TeamMember>()
            .HasOne(member => member.User)
            .WithMany()
            .HasForeignKey(member => member.UserId)
            .OnDelete(DeleteBehavior.Cascade);

        // Payout lookups always filter by owner and overlap a date range.
        modelBuilder.Entity<Payout>()
            .HasIndex(payout => new { payout.UserId, payout.PeriodFrom, payout.PeriodTo });

        base.OnModelCreating(modelBuilder);
    }
}
