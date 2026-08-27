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

    /// <summary>Closes one shortfall, or reopens it when kind is null.</summary>
    Task SettlePeriodAsync(
        int userId, int locationId, DateOnly periodFrom, string stream,
        string? kind, string? note, CancellationToken ct);

    Task<bool> AddEventAsync(Event item, CancellationToken ct);
    Task DeleteEventAsync(Event item, CancellationToken ct);

    Task<bool> AddGoalAsync(Goal item, CancellationToken ct);
    Task UpdateGoalAsync(Goal item, CancellationToken ct);
    Task DeleteGoalAsync(Goal item, CancellationToken ct);

    /// <summary>Persists changes to an entity the query layer handed back tracked.</summary>
    Task SaveAsync(CancellationToken ct);

    /// <summary>
    /// Creates the day or replaces its contents. Keyed on (UserId, Date), which
    /// carries a unique index, so a day cannot end up split across two rows.
    /// </summary>
    Task<Day> UpsertDayAsync(Day incoming, CancellationToken ct);

    /// <summary>
    /// Colours many days at once, each with its own value, creating the days
    /// that do not exist yet. A month painted a day at a time is thirty round
    /// trips and thirty chances for one of them to fail halfway.
    /// </summary>
    Task<Day[]> ApplyColourAsync(
        int userId,
        Dictionary<DateOnly, string?> colours,
        CancellationToken ct);

    /// <summary>
    /// Writes what a delivery brought into one day without disturbing the rest
    /// of it. The day endpoint replaces wholesale because the client always
    /// sends the day entire; a till knows only about its own takings, and
    /// letting it save the same way would delete the shifts sitting under them.
    /// </summary>
    Task<Day> MergeDaySalesAsync(int userId, DaySalesMerge incoming, CancellationToken ct);

    /// <summary>
    /// Places or corrects one shift on one day, leaving the day's other
    /// placements and its sales alone. Matched on the template, so the same
    /// hours delivered twice correct the placement rather than doubling it.
    /// </summary>
    Task<Day> MergeDayShiftAsync(
        int userId,
        DateOnly date,
        DayShift placement,
        CancellationToken ct);

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

/// <summary>
/// One day's worth of an incoming delivery. Every scalar is nullable and null
/// means "not sent" rather than "set to nothing": a payload carrying only tips
/// must not erase a note somebody typed.
/// </summary>
public sealed record DaySalesMerge(
    DateOnly Date,
    List<DaySale> Sales,
    /// <summary>
    /// True makes the delivery the whole truth for the day: positions it does
    /// not mention are removed. False, the default, only touches what it names,
    /// which leaves anything entered by hand where it was.
    /// </summary>
    bool Replace,
    decimal? Tips,
    decimal? TipsCash,
    decimal? Deductions,
    string? Note);
