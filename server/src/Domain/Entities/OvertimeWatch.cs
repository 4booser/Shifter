namespace Shifter.Domain.Entities;

/// <summary>The guard that speaks before the line, not after: hours already worked this week against the place's…</summary>
public static class OvertimeWatch
{
    /// <summary>How close to the threshold is worth a word: the last fifth of it.</summary>
    public const double WarnFraction = 0.8;

    public enum Verdict
    {
        Quiet,
        Approaching,
        Crossed,
    }

    public static Verdict Judge(double workedHours, double threshold)
    {
        if (threshold <= 0) return Verdict.Quiet;
        if (workedHours >= threshold) return Verdict.Crossed;
        if (workedHours >= threshold * WarnFraction) return Verdict.Approaching;

        return Verdict.Quiet;
    }
}
