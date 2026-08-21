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
    public List<Day> Saved { get; } = [];
    public List<Event> Events { get; } = [];
    public int SalesUsage { get; set; }
    public int ShiftsAtLocation { get; set; }
    public List<object> Deleted { get; } = [];

    public Task<Day> UpsertDayAsync(Day incoming, CancellationToken ct)
    {
        Saved.Add(incoming);

        return Task.FromResult(incoming);
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
    public Task<bool> AddShiftAsync(Shift shift, CancellationToken ct) => Task.FromResult(true);
    public Task<bool> AddSalesAsync(Sales sales, CancellationToken ct) => Task.FromResult(true);
    public Task<bool> AddLocationAsync(Location location, CancellationToken ct) => Task.FromResult(true);
    public Task<bool> AddPayoutAsync(Payout payout, CancellationToken ct) => Task.FromResult(true);

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
