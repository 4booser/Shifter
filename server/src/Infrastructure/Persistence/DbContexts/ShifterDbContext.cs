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
    public DbSet<PlannedAssignment> PlannedAssignments => Set<PlannedAssignment>();
    public DbSet<DayAudit> DayAudits => Set<DayAudit>();
    public DbSet<TelegramLink> TelegramLinks => Set<TelegramLink>();
    public DbSet<GigListing> GigListings => Set<GigListing>();
    public DbSet<GigResponse> GigResponses => Set<GigResponse>();
    public DbSet<GigSeeker> GigSeekers => Set<GigSeeker>();
    public DbSet<GigReview> GigReviews => Set<GigReview>();
    public DbSet<PasswordReset> PasswordResets => Set<PasswordReset>();
    public DbSet<ShiftSwap> ShiftSwaps => Set<ShiftSwap>();
    public DbSet<DailyBrief> DailyBriefs => Set<DailyBrief>();
    public DbSet<AssistantMessage> AssistantMessages => Set<AssistantMessage>();
    public DbSet<PeriodSettlement> PeriodSettlements => Set<PeriodSettlement>();
    public DbSet<ExchangeRate> ExchangeRates => Set<ExchangeRate>();
    public DbSet<Availability> Availabilities => Set<Availability>();
    public DbSet<DeviceToken> DeviceTokens => Set<DeviceToken>();
    public DbSet<LeaveRequest> LeaveRequests => Set<LeaveRequest>();
    public DbSet<WorkExpense> Expenses => Set<WorkExpense>();
    public DbSet<WorkDocument> Documents => Set<WorkDocument>();
    public DbSet<Handover> Handovers => Set<Handover>();
    public DbSet<StopItem> StopItems => Set<StopItem>();
    public DbSet<TeamPool> TeamPools => Set<TeamPool>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.ApplyConfigurationsFromAssembly(typeof(ShifterDbContext).Assembly);

        // One account per chat, one chat per account row.
        modelBuilder.Entity<TelegramLink>()
            .HasIndex(link => link.ChatId)
            .IsUnique();

        modelBuilder.Entity<TelegramLink>()
            .HasIndex(link => link.UserId)
            .IsUnique();

        // A listing belongs to whoever posted it, so it leaves with them.
        // Without this the foreign key is left at NO ACTION and anybody who
        // has ever posted a gig simply cannot delete their account.
        modelBuilder.Entity<GigListing>()
            .HasOne(gig => gig.Owner)
            .WithMany()
            .HasForeignKey(gig => gig.OwnerUserId)
            .OnDelete(DeleteBehavior.Cascade);

        // The board reads open gigs by date; owners read their own.
        modelBuilder.Entity<GigListing>()
            .HasIndex(gig => new { gig.Status, gig.Date });
        modelBuilder.Entity<GigListing>()
            .HasIndex(gig => gig.OwnerUserId);

        // One card per person; employers browse the active ones.
        modelBuilder.Entity<GigSeeker>()
            .HasIndex(seeker => seeker.UserId)
            .IsUnique();
        modelBuilder.Entity<GigSeeker>()
            .HasIndex(seeker => seeker.IsActive);

        // One row per token, however many phones a person signs in on.
        modelBuilder.Entity<DeviceToken>()
            .HasIndex(device => device.Token)
            .IsUnique();
        modelBuilder.Entity<DeviceToken>()
            .HasIndex(device => device.UserId);

        // One block per person per day per team; the board reads a range.
        modelBuilder.Entity<Availability>()
            .HasIndex(block => new { block.TeamId, block.UserId, block.Date })
            .IsUnique();
        modelBuilder.Entity<Availability>()
            .HasIndex(block => new { block.TeamId, block.Date });

        // ==== Everything a person owns goes when they do ====
        //
        // These columns named a user by id with no navigation, so EF made no
        // foreign key at all and account deletion left them behind: an entire
        // calendar — dates, hours, wages, tips, fines, notes — living forever
        // under an id that no longer exists. The navigations above are what
        // make the keys real; the behaviour is written here so the intent is
        // in one place.
        // Pointed at the collection User already has. WithMany() with no
        // argument would leave that collection unclaimed, and EF would build a
        // second relationship for it on a shadow column — two foreign keys to
        // the same place, one of which no query knows about.
        modelBuilder.Entity<Day>()
            .HasOne(day => day.User).WithMany(user => user.CalendarDays)
            .HasForeignKey(day => day.UserId)
            .OnDelete(DeleteBehavior.Cascade);

        modelBuilder.Entity<DayAudit>()
            .HasOne(entry => entry.User).WithMany()
            .HasForeignKey(entry => entry.UserId)
            .OnDelete(DeleteBehavior.Cascade);

        modelBuilder.Entity<Availability>()
            .HasOne(block => block.User).WithMany()
            .HasForeignKey(block => block.UserId)
            .OnDelete(DeleteBehavior.Cascade);

        modelBuilder.Entity<LeaveRequest>()
            .HasOne(request => request.User).WithMany()
            .HasForeignKey(request => request.UserId)
            .OnDelete(DeleteBehavior.Cascade);

        modelBuilder.Entity<PlannedAssignment>()
            .HasOne(entry => entry.User).WithMany()
            .HasForeignKey(entry => entry.UserId)
            .OnDelete(DeleteBehavior.Cascade);

        modelBuilder.Entity<CoverOffer>()
            .HasOne(offer => offer.Owner).WithMany()
            .HasForeignKey(offer => offer.OwnerUserId)
            .OnDelete(DeleteBehavior.Cascade);

        modelBuilder.Entity<CoverOffer>()
            .HasOne(offer => offer.Claimant).WithMany()
            .HasForeignKey(offer => offer.ClaimantUserId)
            .OnDelete(DeleteBehavior.Cascade);

        // The second person on a row is forgotten rather than cascaded: a
        // manager leaving must not take everybody's approved holidays or the
        // rota they built with them. The decision stands; the name goes.
        modelBuilder.Entity<LeaveRequest>()
            .HasOne(request => request.DecidedBy).WithMany()
            .HasForeignKey(request => request.DecidedByUserId)
            .OnDelete(DeleteBehavior.SetNull);

        modelBuilder.Entity<PlannedAssignment>()
            .HasOne(entry => entry.CreatedBy).WithMany()
            .HasForeignKey(entry => entry.CreatedByUserId)
            .OnDelete(DeleteBehavior.SetNull);

        // One pool per crew per night. The unique key is the whole point: the
        // reason five people had five numbers is that nothing stopped them.
        modelBuilder.Entity<TeamPool>()
            .HasIndex(pool => new { pool.TeamId, pool.Date })
            .IsUnique();

        modelBuilder.Entity<TeamPool>()
            .HasOne(pool => pool.EnteredBy).WithMany()
            .HasForeignKey(pool => pool.EnteredByUserId)
            .OnDelete(DeleteBehavior.SetNull);

        // The name on a note is forgotten when somebody leaves; the note is
        // not. Losing what the crew was told because its author closed their
        // account would be the wrong way round.
        modelBuilder.Entity<Handover>()
            .HasOne(note => note.UpdatedBy).WithMany()
            .HasForeignKey(note => note.UpdatedByUserId)
            .OnDelete(DeleteBehavior.SetNull);

        modelBuilder.Entity<StopItem>()
            .HasOne(item => item.RaisedBy).WithMany()
            .HasForeignKey(item => item.RaisedByUserId)
            .OnDelete(DeleteBehavior.SetNull);

        modelBuilder.Entity<StopItem>()
            .HasOne(item => item.ClearedBy).WithMany()
            .HasForeignKey(item => item.ClearedByUserId)
            .OnDelete(DeleteBehavior.SetNull);

        // One handover per crew per day: it is the thing you read once, not a
        // thread. The unique key says so rather than the service.
        modelBuilder.Entity<Handover>()
            .HasIndex(note => new { note.TeamId, note.Date })
            .IsUnique();

        // Read as "what is the room missing right now", so the open ones have
        // to come off an index rather than a scan of everything ever raised.
        modelBuilder.Entity<StopItem>()
            .HasIndex(item => new { item.TeamId, item.ClearedAt });

        // Always read as "what of mine runs out soonest".
        modelBuilder.Entity<WorkDocument>()
            .HasIndex(document => new { document.UserId, document.ExpiresOn });

        modelBuilder.Entity<WorkDocument>()
            .HasOne(document => document.User).WithMany()
            .HasForeignKey(document => document.UserId)
            .OnDelete(DeleteBehavior.Cascade);

        // The share link is looked up by slug and must be one listing only.
        modelBuilder.Entity<GigListing>()
            .HasIndex(listing => listing.ShareSlug)
            .IsUnique();

        // Read two ways: everything a crew has pending, and one person's own
        // history. No unique key — a person can ask for July and September.
        modelBuilder.Entity<LeaveRequest>()
            .HasIndex(request => new { request.TeamId, request.From });
        modelBuilder.Entity<LeaveRequest>()
            .HasIndex(request => new { request.TeamId, request.UserId });

        // Always read as a range for one person, exactly like payouts.
        modelBuilder.Entity<WorkExpense>()
            .HasIndex(expense => new { expense.UserId, expense.Date });

        // An expense outlives the place that caused it — a taxi home is still
        // money spent after the bar closes for good — so deleting a place
        // detaches rather than deletes.
        modelBuilder.Entity<WorkExpense>()
            .HasOne(expense => expense.Location)
            .WithMany()
            .HasForeignKey(expense => expense.LocationId)
            .OnDelete(DeleteBehavior.SetNull);

        modelBuilder.Entity<WorkExpense>()
            .HasOne(expense => expense.User)
            .WithMany()
            .HasForeignKey(expense => expense.UserId)
            .OnDelete(DeleteBehavior.Cascade);

        // One line under one period: closing the same shortfall twice is not
        // a second event, and the unique key says so rather than the service.
        modelBuilder.Entity<PeriodSettlement>()
            .HasIndex(entry => new { entry.UserId, entry.LocationId, entry.PeriodFrom, entry.Stream })
            .IsUnique();

        // One rate per currency per day, and that is the only way it is read.
        modelBuilder.Entity<ExchangeRate>()
            .HasIndex(rate => new { rate.Code, rate.Date })
            .IsUnique();

        // The thread is always read newest-first for one person.
        modelBuilder.Entity<AssistantMessage>()
            .HasIndex(message => new { message.UserId, message.CreatedAt });

        // One brief per person per day.
        modelBuilder.Entity<DailyBrief>()
            .HasIndex(brief => new { brief.UserId, brief.Date })
            .IsUnique();

        // Both sides read their own pending swaps.
        modelBuilder.Entity<ShiftSwap>()
            .HasIndex(swap => new { swap.TeamId, swap.Status });
        modelBuilder.Entity<ShiftSwap>()
            .HasIndex(swap => swap.TargetUserId);
        modelBuilder.Entity<ShiftSwap>()
            .HasIndex(swap => swap.ProposerUserId);

        // A reset is looked up by its hash, and an address by itself.
        modelBuilder.Entity<PasswordReset>()
            .HasIndex(reset => reset.TokenHash)
            .IsUnique();
        modelBuilder.Entity<User>()
            .HasIndex(user => user.Email);
        modelBuilder.Entity<User>()
            .HasIndex(user => user.ReferralCode)
            .IsUnique();

        // One verdict per author per target per listing; reputations are read by target.
        modelBuilder.Entity<GigReview>()
            .HasIndex(review => new { review.ListingId, review.AuthorUserId, review.TargetUserId })
            .IsUnique();
        modelBuilder.Entity<GigReview>()
            .HasIndex(review => review.TargetUserId);

        // Stage and the two Shared* properties are worked out from the
        // timestamps beside them; a column for either would be a second copy
        // of the same truth, free to drift out of step with the first.
        modelBuilder.Entity<GigResponse>().Ignore(reply => reply.Stage);
        modelBuilder.Entity<GigResponse>().Ignore(reply => reply.SharedPhone);
        modelBuilder.Entity<GigResponse>().Ignore(reply => reply.SharedTelegram);

        // One person answers one listing once.
        modelBuilder.Entity<GigResponse>()
            .HasIndex(reply => new { reply.ListingId, reply.UserId })
            .IsUnique();
        modelBuilder.Entity<GigResponse>()
            .HasIndex(reply => reply.UserId);
        modelBuilder.Entity<GigResponse>()
            .HasOne(reply => reply.Listing)
            .WithMany(gig => gig.Responses)
            .HasForeignKey(reply => reply.ListingId)
            .OnDelete(DeleteBehavior.Cascade);

        // A day's history is read as one day's list, newest first.
        modelBuilder.Entity<DayAudit>()
            .HasIndex(audit => new { audit.UserId, audit.Date });

        // The board is read week by week, always inside one team.
        modelBuilder.Entity<PlannedAssignment>()
            .HasIndex(assignment => new { assignment.TeamId, assignment.Date });

        // "What is waiting for me" is the other frequent question.
        modelBuilder.Entity<PlannedAssignment>()
            .HasIndex(assignment => new { assignment.UserId, assignment.Status });

        modelBuilder.Entity<PlannedAssignment>()
            .HasOne(assignment => assignment.Team)
            .WithMany()
            .HasForeignKey(assignment => assignment.TeamId)
            .OnDelete(DeleteBehavior.Cascade);

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
