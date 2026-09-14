namespace Shifter.Domain.Entities;

/// <summary>Runs of worked days, counted and nothing else.</summary>
public static class WorkStreaks
{
    /// <summary>Each worked date's 1-based position inside its consecutive run.</summary>
    public static Dictionary<DateOnly, int> Positions(IEnumerable<DateOnly> workedDates)
    {
        var ordered = workedDates.Distinct().OrderBy(date => date).ToArray();
        Dictionary<DateOnly, int> positions = [];

        for (var i = 0; i < ordered.Length; i++)
        {
            positions[ordered[i]] =
                i > 0 && ordered[i] == ordered[i - 1].AddDays(1)
                    ? positions[ordered[i - 1]] + 1
                    : 1;
        }

        return positions;
    }

    /// <summary>The run that is happening right now: consecutive worked days ending today or yesterday.</summary>
    public static int Current(IEnumerable<DateOnly> workedDates, DateOnly today)
    {
        var worked = workedDates.Distinct().ToHashSet();

        var anchor = worked.Contains(today) ? today
            : worked.Contains(today.AddDays(-1)) ? today.AddDays(-1)
            : (DateOnly?)null;

        if (anchor is not DateOnly day) return 0;

        var length = 0;

        while (worked.Contains(day))
        {
            length++;
            day = day.AddDays(-1);
        }

        return length;
    }

    /// <summary>The longest run on record, for «а рекорд — N».</summary>
    public static int Longest(IEnumerable<DateOnly> workedDates)
    {
        var positions = Positions(workedDates);

        return positions.Count == 0 ? 0 : positions.Values.Max();
    }
}
