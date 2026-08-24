namespace Shifter.Domain.Entities;

/// <summary>How one delivery ended. Every arrival gets a row, including the
/// rejected ones — a webhook that silently drops what it does not like is
/// impossible to debug from the sending side.</summary>
public enum DeliveryStatus
{
    /// <summary>Read, mapped and written to the calendar.</summary>
    Applied = 0,

    /// <summary>Already seen: the sender's own id matched an earlier arrival.</summary>
    Duplicate = 1,

    /// <summary>Understood but unusable: a date that will not parse, a position
    /// the account does not have, a quantity below zero.</summary>
    Rejected = 2,

    /// <summary>Never got as far as the contents: bad signature, bad JSON.</summary>
    Failed = 3
}
