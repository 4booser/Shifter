using Shifter.Domain.Entities;

namespace Shifter.Infrastructure.Repositories.Interfaces;

public interface IShifterCommand
{
    Task<bool> AddDayAsync(Day day, CancellationToken ct);
    Task<bool> AddShiftAsync(Shift shift, CancellationToken ct);
    Task<bool> AddSalesAsync(Sales sales, CancellationToken ct);

    Task<bool> AddLocationAsync(Location location, CancellationToken ct);

    Task<bool> AddPayoutAsync(Payout payout, CancellationToken ct);
    Task DeletePayoutAsync(Payout payout, CancellationToken ct);

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
