using Shifter.Domain.Entities;

namespace Shifter.Infrastructure.Repositories.Interfaces;

public interface IShifterCommand
{
    Task<bool> AddDayAsync(Day day, CancellationToken ct);
    Task<bool> AddShiftAsync(Shift shift, CancellationToken ct);
    Task<bool> AddSalesAsync(Sales sales, CancellationToken ct);

    Task<bool> AddLocationAsync(Location location, CancellationToken ct);

    /// <summary>How many shifts point at this place; blocks a destructive delete.</summary>
    Task<int> CountShiftsAtLocationAsync(int locationId, CancellationToken ct);
    Task DeleteLocationAsync(Location location, CancellationToken ct);

    /// <summary>
    /// Clears the place off every template pointing at it, so the place can go
    /// without taking the templates — or the days they sit on — with it.
    /// </summary>
    Task DetachShiftsFromLocationAsync(int locationId, CancellationToken ct);

    /// <summary>How many recorded days used this position.</summary>
    Task<int> CountSalesUsageAsync(int salesId, CancellationToken ct);
    Task DeleteSalesAsync(Sales sales, CancellationToken ct);

    Task<bool> AddPayoutAsync(Payout payout, CancellationToken ct);
    Task DeletePayoutAsync(Payout payout, CancellationToken ct);

    Task<bool> AddEventAsync(Event item, CancellationToken ct);
    Task DeleteEventAsync(Event item, CancellationToken ct);

    /// <summary>Persists changes to an entity the query layer handed back tracked.</summary>
    Task SaveAsync(CancellationToken ct);

    /// <summary>
    /// Creates the day or replaces its contents. Keyed on (UserId, Date), which
    /// carries a unique index, so a day cannot end up split across two rows.
    /// </summary>
    Task<Day> UpsertDayAsync(Day incoming, CancellationToken ct);

    /// <summary>
    /// Adds or removes one template across many dates, creating the missing
    /// days, in a single save. Returns the affected days.
    /// </summary>
    Task<Day[]> ApplyShiftAsync(
        int userId,
        DateOnly[] dates,
        Shift shift,
        bool add,
        CancellationToken ct);
}
