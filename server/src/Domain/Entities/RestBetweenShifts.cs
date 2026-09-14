namespace Shifter.Domain.Entities;

/// <summary>One gap that fell short, and how short.</summary>
public readonly record struct ShortRest(DateOnly After, double Hours);

/// <summary>The hours between clocking out and clocking back in.</summary>
public static class RestBetweenShifts
{
    /// <summary>The EU daily rest rule, and the default nobody has to choose.</summary>
    public const double DefaultHours = 11;

    /// <summary>Gaps at or under <paramref name="threshold"/>, newest last.</summary>
    public static IReadOnlyList<ShortRest> Find(
        IEnumerable<(DateTime Start, DateTime End)> spans,
        double threshold = DefaultHours)
    {
        var ordered = spans.OrderBy(span => span.Start).ToArray();
        var found = new List<ShortRest>();

        // The end reached so far rather than the previous span's end: a short
        // shift wholly inside a long one would otherwise reset the clock and
        // hide the gap that follows.
        DateTime? reached = null;

        foreach (var span in ordered)
        {
            if (reached is DateTime end)
            {
                var gap = (span.Start - end).TotalHours;

                if (gap > 0 && gap <= threshold)
                    found.Add(new ShortRest(DateOnly.FromDateTime(span.Start), Math.Round(gap, 1)));
            }

            reached = reached is DateTime current && current > span.End ? current : span.End;
        }

        return found;
    }

    /// <summary>The shortest of them, or null when there were none.</summary>
    public static double? Shortest(IReadOnlyList<ShortRest> rests)
        => rests.Count == 0 ? null : rests.Min(rest => rest.Hours);
}
