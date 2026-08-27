namespace Shifter.Domain.Entities;

/// <summary>
/// The stations a hospitality rota is counted by. Deliberately short: a list
/// long enough to describe every job is long enough that nobody fills it in,
/// and a coverage gap nobody records is a gap nobody sees.
/// </summary>
public enum PlanRole
{
    /// <summary>Not said. Counted separately rather than guessed at.</summary>
    Unset = 0,
    Bar = 1,
    Kitchen = 2,
    Floor = 3,
    Host = 4,
    Support = 5,
    Manager = 6
}
