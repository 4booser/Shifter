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
    public DbSet<Event> Events => Set<Event>();
    public DbSet<CoverOffer> CoverOffers => Set<CoverOffer>();
    public DbSet<Goal> Goals => Set<Goal>();
    public DbSet<WebhookEndpoint> WebhookEndpoints => Set<WebhookEndpoint>();
    public DbSet<WebhookDelivery> WebhookDeliveries => Set<WebhookDelivery>();
    public DbSet<PushSubscription> PushSubscriptions => Set<PushSubscription>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.ApplyConfigurationsFromAssembly(typeof(ShifterDbContext).Assembly);

        // A browser re-subscribing must land on its old row, not add a twin
        // that doubles every notification.
        modelBuilder.Entity<PushSubscription>()
            .HasIndex(subscription => subscription.Endpoint)
            .IsUnique();

        // A deleted account takes its devices with it.
        modelBuilder.Entity<PushSubscription>()
            .HasOne(subscription => subscription.User)
            .WithMany()
            .HasForeignKey(subscription => subscription.UserId)
            .OnDelete(DeleteBehavior.Cascade);

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

        // One offer per person per shift: raising a hand twice says nothing
        // more than raising it once.
        modelBuilder.Entity<CoverOffer>()
            .HasIndex(offer => new { offer.DayShiftId, offer.ClaimantUserId })
            .IsUnique()
            .HasFilter("\"DayShiftId\" IS NOT NULL");

        // The rota reads offers the same way it reads shifts: this team, this
        // stretch of days.
        modelBuilder.Entity<CoverOffer>()
            .HasIndex(offer => new { offer.TeamId, offer.Date });

        // Deleting the team takes its offers; they mean nothing without it.
        modelBuilder.Entity<CoverOffer>()
            .HasOne(offer => offer.Team)
            .WithMany()
            .HasForeignKey(offer => offer.TeamId)
            .OnDelete(DeleteBehavior.Cascade);

        // Events are read the same way payouts are: whose, and what overlaps
        // the month on screen.
        modelBuilder.Entity<Event>()
            .HasIndex(item => new { item.UserId, item.StartDate, item.EndDate });

        // Deleting an account takes its events with it.
        modelBuilder.Entity<Event>()
            .HasOne(item => item.User)
            .WithMany()
            .HasForeignKey(item => item.UserId)
            .OnDelete(DeleteBehavior.Cascade);

        // Looked up by period whenever a page asks "what am I aiming for over
        // this stretch", which is every load of the statistics page.
        modelBuilder.Entity<Goal>()
            .HasIndex(item => new { item.UserId, item.Period });

        // Two filtered indexes rather than one over all three columns, because
        // Postgres counts NULLs as distinct from each other: a plain unique
        // index on (user, period, anchor) would happily accept a second, third
        // and fourth standing goal for the same period, which is the case it
        // was added to prevent.
        modelBuilder.Entity<Goal>()
            .HasIndex(item => new { item.UserId, item.Period })
            .HasFilter("\"Anchor\" IS NULL")
            .IsUnique();

        modelBuilder.Entity<Goal>()
            .HasIndex(item => new { item.UserId, item.Period, item.Anchor })
            .HasFilter("\"Anchor\" IS NOT NULL")
            .IsUnique();

        modelBuilder.Entity<Goal>()
            .HasOne(item => item.User)
            .WithMany()
            .HasForeignKey(item => item.UserId)
            .OnDelete(DeleteBehavior.Cascade);

        // The token is the whole of an incoming request's identity, so a
        // collision would hand one person's endpoint another person's data.
        modelBuilder.Entity<WebhookEndpoint>()
            .HasIndex(hook => hook.Token)
            .IsUnique();

        // Deleting an account takes its endpoints, and each endpoint takes its
        // log: neither means anything without the other.
        modelBuilder.Entity<WebhookEndpoint>()
            .HasOne(hook => hook.User)
            .WithMany()
            .HasForeignKey(hook => hook.UserId)
            .OnDelete(DeleteBehavior.Cascade);

        // Archiving a template must stay possible while an endpoint points at
        // it, so the default shift is cleared rather than blocking the delete.
        modelBuilder.Entity<WebhookEndpoint>()
            .HasOne(hook => hook.DefaultShift)
            .WithMany()
            .HasForeignKey(hook => hook.DefaultShiftId)
            .OnDelete(DeleteBehavior.SetNull);

        modelBuilder.Entity<WebhookDelivery>()
            .HasOne(delivery => delivery.Endpoint)
            .WithMany(hook => hook.Deliveries)
            .HasForeignKey(delivery => delivery.EndpointId)
            .OnDelete(DeleteBehavior.Cascade);

        // The log is always read newest first, for one endpoint.
        modelBuilder.Entity<WebhookDelivery>()
            .HasIndex(delivery => new { delivery.EndpointId, delivery.ReceivedAt });

        // What makes a retry harmless. Filtered because most senders give no id
        // of their own, and in Postgres those NULLs would not collide anyway —
        // being explicit says the uniqueness is only claimed where there is a
        // value to claim it for.
        modelBuilder.Entity<WebhookDelivery>()
            .HasIndex(delivery => new { delivery.EndpointId, delivery.ExternalId })
            .IsUnique()
            .HasFilter("\"ExternalId\" IS NOT NULL");

        base.OnModelCreating(modelBuilder);
    }
}
