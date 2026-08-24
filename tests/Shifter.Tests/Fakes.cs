using Shifter.Domain.Entities;
using Shifter.Infrastructure.Repositories.Interfaces;

using Xunit;

namespace Shifter.Tests;

/// <summary>
/// In-memory stand-ins for the repositories. Hand-written rather than mocked:
/// the handlers only ever ask these for lists, so a plain object reads better
/// than a chain of setup calls and never lies about what the query returns.
/// </summary>
public sealed class FakeShifterQuery : IShifterQuery
{
    public List<Day> Days { get; } = [];
    public List<Location> Locations { get; } = [];
    public List<Payout> Payouts { get; } = [];
    public List<Shift> Shifts { get; } = [];
    public List<Sales> Sales { get; } = [];
    public List<Event> Events { get; } = [];
    public List<Goal> Goals { get; } = [];

    public Task<Day[]> GetDaysInRangeAsync(int userId, DateOnly from, DateOnly to, CancellationToken ct)
        => Task.FromResult(Days
            .Where(day => day.UserId == userId && day.Date >= from && day.Date <= to)
            .OrderBy(day => day.Date)
            .ToArray());

    public Task<Location[]> GetLocationsAsync(int userId, bool includeArchived, CancellationToken ct)
        => Task.FromResult(Locations
            .Where(place => place.UserId == userId && (includeArchived || !place.Archived))
            .ToArray());

    public Task<Location?> GetLocationAsync(int userId, int id, CancellationToken ct)
        => Task.FromResult(Locations.FirstOrDefault(p => p.UserId == userId && p.Id == id));

    public Task<Payout[]> GetPayoutsAsync(int userId, DateOnly from, DateOnly to, CancellationToken ct)
        => Task.FromResult(Payouts
            .Where(payout => payout.UserId == userId
                && payout.PeriodTo >= from && payout.PeriodTo <= to)
            .ToArray());

    public Task<Payout?> GetPayoutAsync(int userId, int id, CancellationToken ct)
        => Task.FromResult(Payouts.FirstOrDefault(p => p.UserId == userId && p.Id == id));

    public Task<Shift[]> GetShiftsByIdsAsync(int userId, int[] ids, CancellationToken ct)
        => Task.FromResult(Shifts
            .Where(shift => shift.UserId == userId && ids.Contains(shift.Id))
            .ToArray());

    public Task<Shift[]> GetShiftsAsync(int userId, bool includeArchived, CancellationToken ct)
        => Task.FromResult(Shifts
            .Where(shift => shift.UserId == userId && (includeArchived || !shift.Archived))
            .ToArray());

    public Task<Shift?> GetShiftAsync(int userId, int id, CancellationToken ct)
        => Task.FromResult(Shifts.FirstOrDefault(s => s.UserId == userId && s.Id == id));

    public Task<Sales[]> GetSalesAsync(int userId, bool includeArchived, CancellationToken ct)
        => Task.FromResult(Sales
            .Where(item => item.UserId == userId && (includeArchived || !item.Archived))
            .ToArray());

    public Task<Sales?> GetSalesItemAsync(int userId, int id, CancellationToken ct)
        => Task.FromResult(Sales.FirstOrDefault(s => s.UserId == userId && s.Id == id));

    public Task<Sales[]> GetSalesByIdsAsync(int userId, int[] ids, CancellationToken ct)
        => Task.FromResult(Sales
            .Where(item => item.UserId == userId && ids.Contains(item.Id))
            .ToArray());

    // Overlap rather than containment, exactly as the real query does: a test
    // that only saw events starting inside the range would pass against a
    // repository that quietly drops the ones running through it.
    public Task<Goal[]> GetGoalsAsync(int userId, CancellationToken ct)
        => Task.FromResult(Goals.Where(item => item.UserId == userId).ToArray());

    public Task<Goal?> GetGoalAsync(int userId, int id, CancellationToken ct)
        => Task.FromResult(Goals.FirstOrDefault(item => item.UserId == userId && item.Id == id));

    public Task<Goal?> FindGoalAsync(
        int userId,
        GoalPeriod period,
        DateOnly? anchor,
        CancellationToken ct)
        => Task.FromResult(Goals.FirstOrDefault(
            item => item.UserId == userId && item.Period == period && item.Anchor == anchor));

    public Task<Event[]> GetEventsInRangeAsync(
        int userId,
        DateOnly from,
        DateOnly to,
        CancellationToken ct)
        => Task.FromResult(Events
            .Where(item => item.UserId == userId
                && item.StartDate <= to
                && item.EndDate >= from)
            .OrderBy(item => item.StartDate)
            .ToArray());

    public Task<Event?> GetEventAsync(int userId, int id, CancellationToken ct)
        => Task.FromResult(Events.FirstOrDefault(item => item.UserId == userId && item.Id == id));
}

public sealed class FakeShifterCommand : IShifterCommand
{
    /// <summary>
    /// The query side, when a test has one. The handlers re-read what they have
    /// just written — that is how a response gets its location name and colour
    /// — so without somewhere for a write to land, the read finds nothing and
    /// the fake quietly answers a different question than the database would.
    /// </summary>
    private readonly FakeShifterQuery? _query;

    public FakeShifterCommand(FakeShifterQuery? query = null) => _query = query;

    public List<Day> Saved { get; } = [];
    public List<Event> Events { get; } = [];
    public List<Goal> Goals { get; } = [];
    public int SalesUsage { get; set; }
    public int ShiftsAtLocation { get; set; }
    public List<object> Deleted { get; } = [];

    public Task<Day> UpsertDayAsync(Day incoming, CancellationToken ct)
    {
        Saved.Add(incoming);

        return Task.FromResult(incoming);
    }

    /// <summary>Dates handed to the bulk colour call, in the order they came.</summary>
    public List<KeyValuePair<DateOnly, string?>> Coloured { get; } = [];

    public Task<Day[]> ApplyColourAsync(
        int userId,
        Dictionary<DateOnly, string?> colours,
        CancellationToken ct)
    {
        Coloured.AddRange(colours);

        Day[] touched = colours
            .Where(pair => pair.Value is not null)
            .Select(pair => new Day
            {
                UserId = userId,
                Date = pair.Key,
                Colour = pair.Value,
            })
            .ToArray();

        Saved.AddRange(touched);

        return Task.FromResult(touched);
    }

    public Task<Day[]> ApplyShiftAsync(
        int userId,
        DateOnly[] dates,
        Shift shift,
        bool add,
        CancellationToken ct)
    {
        Day[] touched = dates
            .Select(date => new Day
            {
                UserId = userId,
                Date = date,
                Shifts = add ? [DayShift.From(shift, false)] : [],
            })
            .ToArray();

        Saved.AddRange(touched);

        return Task.FromResult(touched);
    }

    public Task<int> CountSalesUsageAsync(int salesId, CancellationToken ct)
        => Task.FromResult(SalesUsage);

    public Task<int> CountShiftsAtLocationAsync(int locationId, CancellationToken ct)
        => Task.FromResult(ShiftsAtLocation);

    public Task DeleteLocationAsync(Location location, CancellationToken ct)
    {
        Deleted.Add(location);

        return Task.CompletedTask;
    }

    /// <summary>Records which place was cleared off its templates, if any.</summary>
    public int? DetachedFrom { get; private set; }

    public Task DetachShiftsFromLocationAsync(int locationId, CancellationToken ct)
    {
        DetachedFrom = locationId;

        return Task.CompletedTask;
    }

    public Task DeleteSalesAsync(Sales sales, CancellationToken ct)
    {
        Deleted.Add(sales);

        return Task.CompletedTask;
    }

    public Task DeletePayoutAsync(Payout payout, CancellationToken ct)
    {
        Deleted.Add(payout);

        return Task.CompletedTask;
    }

    public Task<bool> AddDayAsync(Day day, CancellationToken ct) => Task.FromResult(true);
    public Task<bool> AddShiftAsync(Shift shift, CancellationToken ct)
    {
        if (_query is not null)
        {
            shift.Id = shift.Id == 0 ? _query.Shifts.Count + 1 : shift.Id;

            // Attaching the place is what EF's Include does on the re-read.
            shift.Location = _query.Locations
                .FirstOrDefault(place => place.Id == shift.LocationId);

            _query.Shifts.Add(shift);
        }

        return Task.FromResult(true);
    }
    public Task<bool> AddSalesAsync(Sales sales, CancellationToken ct) => Task.FromResult(true);
    public Task<bool> AddLocationAsync(Location location, CancellationToken ct) => Task.FromResult(true);
    public Task<bool> AddPayoutAsync(Payout payout, CancellationToken ct) => Task.FromResult(true);

    public Task<bool> AddGoalAsync(Goal item, CancellationToken ct)
    {
        Goals.Add(item);
        _query?.Goals.Add(item);

        return Task.FromResult(true);
    }

    /// <summary>The row is already the tracked instance, so this only records
    /// that a save happened.</summary>
    public Task UpdateGoalAsync(Goal item, CancellationToken ct)
    {
        if (!Goals.Contains(item)) Goals.Add(item);

        return Task.CompletedTask;
    }

    public Task DeleteGoalAsync(Goal item, CancellationToken ct)
    {
        Goals.Remove(item);
        _query?.Goals.Remove(item);
        Deleted.Add(item);

        return Task.CompletedTask;
    }

    public Task<bool> AddEventAsync(Event item, CancellationToken ct)
    {
        Events.Add(item);

        return Task.FromResult(true);
    }

    public Task DeleteEventAsync(Event item, CancellationToken ct)
    {
        Events.Remove(item);
        Deleted.Add(item);

        return Task.CompletedTask;
    }

    public Task SaveAsync(CancellationToken ct) => Task.CompletedTask;

    /// <summary>Every merge a delivery asked for, in order. What the ingest
    /// handler resolved is the thing under test — the database's own merge is
    /// tested where it lives.</summary>
    public List<DaySalesMerge> Merges { get; } = [];

    /// <summary>Placements written by an hours delivery, with their date.</summary>
    public List<(DateOnly Date, DayShift Placement)> Placed { get; } = [];

    public Task<Day> MergeDaySalesAsync(int userId, DaySalesMerge incoming, CancellationToken ct)
    {
        Merges.Add(incoming);

        Day day = Existing(userId, incoming.Date);

        if (incoming.Tips is not null) day.Tips = incoming.Tips;
        if (incoming.TipsCash is not null) day.TipsCash = incoming.TipsCash;
        if (incoming.Deductions is not null) day.Deductions = incoming.Deductions;
        if (incoming.Note is not null) day.Note = incoming.Note;

        day.Sales ??= [];

        foreach (DaySale entry in incoming.Sales)
        {
            day.Sales.RemoveAll(row => row.SalesId == entry.SalesId);

            if (entry.Quantity > 0) day.Sales.Add(entry);
        }

        if (incoming.Replace)
        {
            int[] sent = incoming.Sales.Select(entry => entry.SalesId).ToArray();

            day.Sales.RemoveAll(row => !sent.Contains(row.SalesId));
        }

        Saved.Add(day);

        return Task.FromResult(day);
    }

    public Task<Day> MergeDayShiftAsync(
        int userId,
        DateOnly date,
        DayShift placement,
        CancellationToken ct)
    {
        Placed.Add((date, placement));

        Day day = Existing(userId, date);

        day.Shifts ??= [];
        day.Shifts.RemoveAll(entry => entry.ShiftId == placement.ShiftId);
        day.Shifts.Add(placement);

        Saved.Add(day);

        return Task.FromResult(day);
    }

    /// <summary>
    /// The day already on the calendar, or a new one. Kept in the query fake
    /// where there is one, so a test can assert that a delivery left the rest
    /// of the day alone.
    /// </summary>
    private Day Existing(int userId, DateOnly date)
    {
        Day? day = _query?.Days.FirstOrDefault(item => item.UserId == userId && item.Date == date);

        if (day is not null) return day;

        day = new Day { UserId = userId, Date = date, Shifts = [], Sales = [] };

        _query?.Days.Add(day);

        return day;
    }
}

/// <summary>Builders that keep the arrange blocks down to what a test is about.</summary>
public static class Build
{
    public const int UserId = 1;

    public static Location Place(
        int id,
        string name = "Bar",
        decimal tipOutOfTips = 0m,
        decimal tipOutOfSales = 0m,
        decimal meal = 0m,
        double overtimeAfter = 40,
        decimal multiplier = 1.5m) => new Location
        {
            Id = id,
            UserId = UserId,
            Name = name,
            TipOutOfTipsPercent = tipOutOfTips,
            TipOutOfSalesPercent = tipOutOfSales,
            MealDeduction = meal,
            OvertimeWeeklyHours = overtimeAfter,
            OvertimeMultiplier = multiplier,
        };

    public static Shift Template(
        int id,
        int? locationId = null,
        Location? location = null,
        string name = "Day",
        SalaryPeriod period = SalaryPeriod.Hour,
        decimal amount = 100m,
        string start = "09:00",
        string end = "17:00") => new Shift
        {
            Id = id,
            UserId = UserId,
            Name = name,
            LocationId = locationId ?? location?.Id,
            Location = location,
            SalaryPeriod = period,
            SalaryAmount = amount,
            StartTime = TimeOnly.Parse(start),
            EndTime = TimeOnly.Parse(end),
        };

    public static Day WorkedDay(
        string date,
        Shift template,
        bool worked = true,
        decimal? tips = null,
        decimal? deductions = null,
        List<DaySale>? sales = null) => new Day
        {
            UserId = UserId,
            Date = DateOnly.Parse(date),
            Shifts = [DayShift.From(template, worked)],
            Sales = sales,
            Tips = tips,
            Deductions = deductions,
        };

    public static DaySale Sale(int id, int quantity, decimal price, decimal percentage) =>
        new DaySale
        {
            SalesId = id,
            Sales = new Sales { Id = id, UserId = UserId, Name = "Wine", Price = price },
            Quantity = quantity,
            UnitPrice = price,
            Percentage = percentage,
        };
}
