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

    /// <summary>Clears the place off every template pointing at it, so the place can go without taking the templates — or the…</summary>
    Task DetachShiftsFromLocationAsync(int locationId, CancellationToken ct);

    /// <summary>How many recorded days used this position.</summary>
    Task<int> CountSalesUsageAsync(int salesId, CancellationToken ct);
    Task DeleteSalesAsync(Sales sales, CancellationToken ct);

    Task<bool> AddPayoutAsync(Payout payout, CancellationToken ct);
    Task DeletePayoutAsync(Payout payout, CancellationToken ct);

    /// <summary>Deletes every payment and period settlement the account has.</summary>
    Task<int> WipePayoutsAsync(int userId, CancellationToken ct);
    Task<bool> AddExpenseAsync(WorkExpense expense, CancellationToken ct);
    Task DeleteExpenseAsync(WorkExpense expense, CancellationToken ct);

    /// <summary>Closes one shortfall, or reopens it when kind is null.</summary>
    Task SettlePeriodAsync(
        int userId, int locationId, DateOnly periodFrom, string stream,
        string? kind, string? note, CancellationToken ct);

    Task<bool> AddEventAsync(Event item, CancellationToken ct);
    Task DeleteEventAsync(Event item, CancellationToken ct);

    Task<bool> AddExpenseRuleAsync(ExpenseRule rule, CancellationToken ct);
    /// <summary>Detaches the expenses it produced, then removes the rule.</summary>
    Task DeleteExpenseRuleAsync(ExpenseRule rule, CancellationToken ct);

    Task<bool> AddEventTemplateAsync(EventTemplate item, CancellationToken ct);
    /// <summary>Detaches the events that came from it, then removes the row.</summary>
    Task DeleteEventTemplateAsync(EventTemplate item, CancellationToken ct);

    Task<bool> AddGoalAsync(Goal item, CancellationToken ct);
    Task UpdateGoalAsync(Goal item, CancellationToken ct);
    Task DeleteGoalAsync(Goal item, CancellationToken ct);

    /// <summary>Persists changes to an entity the query layer handed back tracked.</summary>
    Task SaveAsync(CancellationToken ct);

    /// <summary>Appends one trophy row; the shelf is append-only by design.</summary>
    Task AddGoalCheerAsync(GoalCheer cheer, CancellationToken ct);

    /// <summary>Creates the day or replaces its contents.</summary>
    Task<Day> UpsertDayAsync(Day incoming, CancellationToken ct);

    /// <summary>Colours many days at once, each with its own value, creating the days that do not exist yet.</summary>
    Task<Day[]> ApplyColourAsync(
        int userId,
        Dictionary<DateOnly, string?> colours,
        CancellationToken ct);

    /// <summary>Writes what a delivery brought into one day without disturbing the rest of it.</summary>
    Task<Day> MergeDaySalesAsync(int userId, DaySalesMerge incoming, CancellationToken ct);

    /// <summary>Places or corrects one shift on one day, leaving the day's other placements and its sales alone.</summary>
    Task<Day> MergeDayShiftAsync(
        int userId,
        DateOnly date,
        DayShift placement,
        MergeTerms terms,
        CancellationToken ct);

    /// <summary>Adds or removes one template across many dates, creating the missing days, in a single save. The time is the wall clock where the work happens.</summary>
    Task<Day[]> ApplyShiftAsync(
        int userId,
        DateOnly[] dates,
        Shift shift,
        bool add,
        DateTime now,
        CancellationToken ct);

    /// <summary>Brings the placements still waiting on a template onto its new hours. Written by the save that follows, so the template and its days land together.</summary>
    Task RetimePlannedAsync(Shift before, Shift after, DateOnly today, CancellationToken ct);
}

/// <summary>One day's worth of an incoming delivery.</summary>
/// <summary>How far a route's word goes over a shift already on the day. Left at the defaults, the break is the template's usual and Worked is the route's own answer.</summary>
public readonly record struct MergeTerms(
    /// <summary>The break is the route's word about this shift, so it may shorten what is held.</summary>
    bool BreakStated = false,
    /// <summary>The end was worked out from a count of paid hours, and means nothing apart from that count.</summary>
    bool Counted = false,
    /// <summary>The route plans time and has no word on whether it was worked.</summary>
    bool PlanOnly = false);

public sealed record DaySalesMerge(
    DateOnly Date,
    List<DaySale> Sales,
    /// <summary>True makes the delivery the whole truth for the day: positions it does not mention are removed.</summary>
    bool Replace,
    decimal? Tips,
    decimal? TipsCash,
    decimal? Deductions,
    string? Note);
