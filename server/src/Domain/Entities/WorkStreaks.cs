namespace Shifter.Domain.Entities;

/// <summary>
/// Runs of worked days, counted and nothing else.
///
/// Twelve days in a row is a fact a person notices on the tenth. The app can
/// see it on the third — and its whole job here is to say the number out
/// loud. No advice: «двенадцатый день подряд» is a constatation, and any
/// sentence starting with «вам стоит» belongs to somebody who was asked.
/// </summary>
public static class WorkStreaks
{
    /// <summary>
    /// Each worked date's 1-based position inside its consecutive run.
    /// Day one of a run is 1; a day after a gap starts a new run at 1.
    /// </summary>
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

    /// <summary>
    /// The run that is happening right now: consecutive worked days ending
    /// today or yesterday. Yesterday counts because a person reading a
    /// morning brief has not worked today yet — their streak is still alive
    /// until a day actually passes without a shift.
    /// </summary>
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
