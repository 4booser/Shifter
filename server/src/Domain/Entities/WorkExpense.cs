namespace Shifter.Domain.Entities;

/// <summary>
/// Money the job cost rather than money the job took.
///
/// Deliberately not the same field as a fine. A fine is what the venue took off
/// somebody — a broken glass, a till that came up short — and it is an argument
/// waiting to happen. An expense is what the work itself cost them: the taxi
/// home at four in the morning, the shoes the floor destroys, the shirt with
/// the logo on it. Adding both into one number would lose both conversations.
///
/// Never subtracted from earnings. Take-home is what arrived, and an expense
/// happened after that — it is reported beside the total, the way holiday
/// accrual is reported beside it, so nobody's payslip stops matching the app.
/// </summary>
public sealed class WorkExpense
{
    public const int NoteMax = 200;

    public int Id { get; set; }

    public int UserId { get; set; }
    public User? User { get; set; }

    /// <summary>
    /// Which place made it necessary, where that is knowable. Null for the
    /// ones that belong to the trade rather than to an employer — a knife
    /// roll, a sommelier course.
    /// </summary>
    public int? LocationId { get; set; }
    public Location? Location { get; set; }

    public required DateOnly Date { get; set; }

    public decimal Amount { get; set; }

    /// <summary>
    /// What kind: "transport", "uniform", "tools", "food", "training",
    /// "other". A short list on purpose — one nobody scrolls is one people
    /// answer honestly, and the note carries the rest.
    /// </summary>
    public string Kind { get; set; } = "other";

    public string? Note { get; set; }

    /// <summary>
    /// The standing cost this came from, when it came from one.
    ///
    /// A conjured occurrence is a prediction; the moment somebody confirms or
    /// corrects it, a real row is written carrying this, and the prediction
    /// for that day steps aside. Without it the two would both be shown and
    /// the month would count the travel pass twice.
    /// </summary>
    public int? RuleId { get; set; }
    public ExpenseRule? Rule { get; set; }
}
