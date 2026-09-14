namespace Shifter.Domain.Entities;

/// <summary>Where in the venue a shift was worked.</summary>
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
