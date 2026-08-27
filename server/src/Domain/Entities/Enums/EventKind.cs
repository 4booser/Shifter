namespace Shifter.Domain.Entities;

/// <summary>
/// The shapes a non-working day comes in. Only these four, because each one
/// has to mean something to the forecast, and a list nobody can explain is
/// worse than a short one.
/// </summary>
public enum EventKind
{
    /// <summary>A course, a birthday, a doctor's appointment — no effect on pace.</summary>
    Ordinary = 0,

    /// <summary>Paid leave. Counts against an allowance, never against the pace.</summary>
    Vacation = 1,

    /// <summary>Sick leave. Excluded from the pace the same way.</summary>
    Sick = 2,

    /// <summary>A day swapped off, by agreement.</summary>
    DayOff = 3,
}
