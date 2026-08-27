namespace Shifter.Domain.Entities;

/// <summary>
/// One currency on one day, as the National Bank published it: how many
/// hryvnia one unit was worth. Stored rather than fetched on demand because
/// a rate is a fact about a past day and must not change under a report —
/// a month that was worth one figure yesterday and another today is not a
/// month anybody can check.
/// </summary>
public sealed class ExchangeRate
{
    public int Id { get; set; }

    /// <summary>ISO code, upper case: "PLN", "EUR".</summary>
    public required string Code { get; set; }

    /// <summary>The day the rate applied to, not the day it was fetched.</summary>
    public required DateOnly Date { get; set; }

    /// <summary>Hryvnia per one unit of the currency.</summary>
    public required decimal Rate { get; set; }

    public DateTime FetchedAt { get; set; } = DateTime.UtcNow;
}
