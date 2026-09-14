namespace Shifter.Domain.Entities;

/// <summary>How one delivery ended.</summary>
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
    Failed = 3,

    /// <summary>Read and understood, and there was nothing in it: no positions, no amounts.</summary>
    Empty = 4
}
