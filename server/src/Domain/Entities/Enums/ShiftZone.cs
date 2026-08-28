namespace Shifter.Domain.Entities;

/// <summary>
/// Where in the venue a shift was worked.
///
/// Every waiter knows the terrace tips better than the bar and none of them
/// can say by how much, because nobody has ever written it down against the
/// hours. Deliberately short: a list long enough to describe every venue is a
/// list nobody fills in, and a zone nobody records is a zone nobody can
/// compare.
/// </summary>
public enum ShiftZone
{
    /// <summary>Not said. Counted apart rather than guessed at.</summary>
    Unset = 0,
    Hall = 1,
    Bar = 2,
    Terrace = 3,
    Banquet = 4,
    Takeaway = 5,
}
