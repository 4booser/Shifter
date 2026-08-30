namespace Shifter.Application.Features.business.DTOs;

/// <summary>
/// One pay period at one place: what the calendar says it earned, what
/// actually arrived, and where that leaves things.
/// </summary>
public record PayPeriodDto(
    int location_id,
    string location_name,
    string colour,
    DateOnly period_from,
    DateOnly period_to,
    /// <summary>When the money is due, from the place's own pay day.</summary>
    DateOnly due_on,
    /// <summary>Take-home for the period: earned less tax withheld.</summary>
    decimal expected,
    decimal paid,
    /// <summary>paid minus expected; negative is a shortfall.</summary>
    decimal difference,
    double hours,
    /// <summary>
    /// open, due, overdue, partial, paid, short or over. "partial" is an
    /// advance with the settlement still to come — money outstanding, but
    /// nobody has done anything wrong yet.
    /// </summary>
    string status,
    /// <summary>Days past the due date with nothing recorded; 0 otherwise.</summary>
    int days_late,
    /// <summary>
    /// Which payment this is: "all" where a place settles everything at once,
    /// or "wage" and "commission" where the percentage runs on its own cycle.
    /// Two rows can then cover the same days without reading as a duplicate.
    /// </summary>
    string stream = "all",
    /// <summary>
    /// Set where this shortfall has been closed: "paid" if the money arrived
    /// off the books, "written-off" if it never will. Both stop it counting
    /// as owed; only one of them is good news.
    /// </summary>
    string? settled = null,
    string? settled_note = null,
    /// <summary>How much of what arrived was an advance.</summary>
    decimal paid_advance = 0m);

/// <summary>
/// A place that has come up short more than once. One short period is a
/// rounding argument; three in a row at the same place is a pattern worth
/// taking to a manager, which is the whole point of recording payouts.
/// </summary>
public record ShortfallDto(
    int location_id,
    string location_name,
    /// <summary>Consecutive periods short, most recent first.</summary>
    int periods,
    /// <summary>
    /// How much is missing, as a positive amount. Deliberately the opposite
    /// sign to a period's difference: that field answers "which way did it
    /// go", this one answers "how much are you owed", and a claim reads badly
    /// with a minus in front of it.
    /// </summary>
    decimal total_short,
    DateOnly since,
    /// <summary>
    /// Which payment is short. A place that settles the wage and the commission
    /// separately can be behind on both, and two claims naming the same place
    /// with no other difference read as the same claim printed twice.
    /// </summary>
    string stream = "all");

public record ReconciliationDto(
    PayPeriodDto[] periods,
    ShortfallDto[] shortfalls,
    /// <summary>Everything still owed across every place.</summary>
    decimal awaited,
    /// <summary>Owed and past its due date.</summary>
    decimal overdue);

/// <summary>
/// The one rule for "when does money land next": the earliest unsettled
/// period with something owed, due today or later. Both the brief and the
/// assistant read paydays through this — two callers, one opinion.
/// </summary>
public static class NextPayout
{
    public static PayPeriodDto? From(ReconciliationDto schedule, DateOnly today) =>
        schedule.periods
            .Where(row => row.settled is null && row.due_on >= today && row.expected > 0m)
            .OrderBy(row => row.due_on)
            .FirstOrDefault();
}
