using Shifter.Domain.Entities;

namespace Shifter.Infrastructure.Repositories.Interfaces;

public interface IShifterQuery
{
    Task<Shift[]> GetShiftsByIdsAsync(int userId, int[] ids, CancellationToken ct);

    /// <summary>Palette contents. Archived templates are included only on request.</summary>
    Task<Shift[]> GetShiftsAsync(int userId, bool includeArchived, CancellationToken ct);
    Task<Sales[]> GetSalesAsync(int userId, bool includeArchived, CancellationToken ct);

    /// <summary>
    /// Owner-scoped single fetch for editing. Archived rows come back too,
    /// otherwise they could never be restored.
    /// </summary>
    Task<Shift?> GetShiftAsync(int userId, int id, CancellationToken ct);
    Task<Sales?> GetSalesItemAsync(int userId, int id, CancellationToken ct);

    Task<Sales[]> GetSalesByIdsAsync(int userId, int[] ids, CancellationToken ct);
    Task<Day[]> GetDaysInRangeAsync(int userId, DateOnly from, DateOnly to, CancellationToken ct);

    Task<Location[]> GetLocationsAsync(int userId, bool includeArchived, CancellationToken ct);
    Task<Location?> GetLocationAsync(int userId, int id, CancellationToken ct);

    Task<Payout[]> GetPayoutsAsync(int userId, DateOnly from, DateOnly to, CancellationToken ct);
    Task<Payout?> GetPayoutAsync(int userId, int id, CancellationToken ct);
    Task<WorkExpense[]> GetExpensesAsync(int userId, DateOnly from, DateOnly to, CancellationToken ct);
    Task<WorkExpense?> GetExpenseAsync(int userId, int id, CancellationToken ct);

    /// <summary>Shortfalls this person has drawn a line under.</summary>
    Task<PeriodSettlement[]> GetSettlementsAsync(int userId, CancellationToken ct);

    /// <summary>Everything overlapping the range, not only what starts inside it.</summary>
    Task<Event[]> GetEventsInRangeAsync(int userId, DateOnly from, DateOnly to, CancellationToken ct);

    /// <summary>The event palette: what somebody puts on days that is not work.</summary>
    Task<EventTemplate[]> GetEventTemplatesAsync(int userId, bool includeArchived, CancellationToken ct);
    Task<EventTemplate?> GetEventTemplateAsync(int userId, int id, CancellationToken ct);
    Task<Event?> GetEventAsync(int userId, int id, CancellationToken ct);

    Task<Goal[]> GetGoalsAsync(int userId, CancellationToken ct);
    Task<Goal?> GetGoalAsync(int userId, int id, CancellationToken ct);
    /// <summary>The row a period+anchor pair already occupies, if any.</summary>
    Task<Goal?> FindGoalAsync(int userId, GoalPeriod period, DateOnly? anchor, CancellationToken ct);
}
