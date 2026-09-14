namespace Shifter.Domain.Entities;

/// <summary>What an endpoint is allowed to write.</summary>
public enum WebhookKind
{
    /// <summary>Sold positions, tips and deductions for one day.</summary>
    Sales = 0,

    /// <summary>Hours actually worked on one day.</summary>
    Hours = 1,

    /// <summary>Both, out of one delivery.</summary>
    Both = 2
}
