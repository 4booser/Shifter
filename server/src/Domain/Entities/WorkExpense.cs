namespace Shifter.Domain.Entities;

/// <summary>Money the job cost rather than money the job took.</summary>
public sealed class WorkExpense
{
    public const int NoteMax = 200;

    public int Id { get; set; }

    public int UserId { get; set; }
    public User? User { get; set; }

    /// <summary>Which place made it necessary, where that is knowable.</summary>
    public int? LocationId { get; set; }
    public Location? Location { get; set; }

    public required DateOnly Date { get; set; }

    public decimal Amount { get; set; }

    /// <summary>What kind: "transport", "uniform", "tools", "food", "training", "other".</summary>
    public string Kind { get; set; } = "other";

    public string? Note { get; set; }

    /// <summary>The standing cost this came from, when it came from one.</summary>
    public int? RuleId { get; set; }
    public ExpenseRule? Rule { get; set; }
}
