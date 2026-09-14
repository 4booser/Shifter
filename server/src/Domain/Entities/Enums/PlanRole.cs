namespace Shifter.Domain.Entities;

/// <summary>The stations a hospitality rota is counted by.</summary>
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
