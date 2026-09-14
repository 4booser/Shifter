namespace Shifter.Domain.Entities;

/// <summary>One currency on one day, as the National Bank published it: how many hryvnia one unit was worth.</summary>
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
