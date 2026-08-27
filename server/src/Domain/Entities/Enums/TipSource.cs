namespace Shifter.Domain.Entities;

/// <summary>
/// Where a shift's tips come from. Hospitality splits along this line and the
/// two are not variations of one number: personal tips are what this person
/// was handed, a pool share is a slice of what the room took, and the second
/// cannot be typed in per person without lying about the first.
/// </summary>
public enum TipSource
{
    Personal = 0,
    Pool = 1
}
