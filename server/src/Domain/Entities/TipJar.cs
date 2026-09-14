namespace Shifter.Domain.Entities;

/// <summary>What the rule says should have been put aside, and against what.</summary>
public readonly record struct TipJarState(
    /// <summary>The share being put aside, as a percent. Zero means the rule is off.</summary>
    decimal Percent,
    /// <summary>Tips earned since the rule started.</summary>
    decimal TipsSince,
    /// <summary>The share of them, which is what should be in the jar.</summary>
    decimal Saved,
    decimal Goal,
    /// <summary>Days since the rule started, so a pace can be read off it.</summary>
    int Days);

/// <summary>A share of tips, set aside on paper.</summary>
public static class TipJar
{
    public static TipJarState Since(
        decimal percent,
        decimal goal,
        decimal tipsSince,
        DateOnly? from,
        DateOnly today)
    {
        if (percent <= 0 || from is null)
            return new TipJarState(0m, 0m, 0m, goal, 0);

        var days = Math.Max(0, today.DayNumber - from.Value.DayNumber);

        return new TipJarState(
            percent,
            tipsSince,
            Math.Round(tipsSince * percent / 100m, 2),
            goal,
            days);
    }

    /// <summary>When the goal is reached at this pace, or null when there is no goal, no pace, or not enough of a run to say…</summary>
    public static DateOnly? Reaches(TipJarState state, DateOnly today)
    {
        // A fortnight at least. Extrapolating three days of tips into a date
        // months away is arithmetic dressed as a promise.
        if (state.Goal <= 0 || state.Days < 14 || state.Saved <= 0) return null;
        if (state.Saved >= state.Goal) return today;

        var perDay = state.Saved / state.Days;

        if (perDay <= 0) return null;

        var left = (double)((state.Goal - state.Saved) / perDay);

        // Five years out is not a forecast, it is a way of saying "no".
        return left > 365 * 5 ? null : today.AddDays((int)Math.Ceiling(left));
    }
}
