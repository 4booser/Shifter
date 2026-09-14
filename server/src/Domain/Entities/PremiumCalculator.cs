namespace Shifter.Domain.Entities;

/// <summary>Night and public-holiday premiums: the two extras Ukrainian hospitality actually pays and nobody counts by…</summary>
public static class PremiumCalculator
{
    /// <summary>Hours of a shift that fall inside the night window.</summary>
    public static double Span(TimeOnly start, TimeOnly end)
    {
        double minutes = end.ToTimeSpan().TotalMinutes - start.ToTimeSpan().TotalMinutes;

        if (minutes <= 0) minutes += 24 * 60;

        return minutes / 60;
    }

    public static double NightHours(TimeOnly start, TimeOnly end, TimeOnly from, TimeOnly to)
    {
        var shiftStart = start.ToTimeSpan().TotalMinutes;
        var shiftEnd = end.ToTimeSpan().TotalMinutes;

        if (shiftEnd <= shiftStart) shiftEnd += 24 * 60; // past midnight

        var windowStart = from.ToTimeSpan().TotalMinutes;
        var windowEnd = to.ToTimeSpan().TotalMinutes;

        if (windowEnd <= windowStart) windowEnd += 24 * 60;

        double minutes = 0;

        // Yesterday's window can still cover this morning, and tomorrow's can
        // cover an overnight shift — three copies cover every real case.
        for (var day = -1; day <= 1; day++)
        {
            var offset = day * 24 * 60;
            var overlapStart = Math.Max(shiftStart, windowStart + offset);
            var overlapEnd = Math.Min(shiftEnd, windowEnd + offset);

            if (overlapEnd > overlapStart) minutes += overlapEnd - overlapStart;
        }

        return Math.Round(minutes / 60, 4);
    }

    /// <summary>What the two premiums add to one shift.</summary>
    public static decimal Extra(
        double nightHours,
        double totalHours,
        decimal hourlyRate,
        decimal nightMultiplier,
        decimal holidayMultiplier,
        bool isPublicHoliday)
    {
        if (hourlyRate <= 0 || totalHours <= 0) return 0m;

        if (isPublicHoliday && holidayMultiplier > 1m)
            return (decimal)totalHours * hourlyRate * (holidayMultiplier - 1m);

        if (nightMultiplier > 1m && nightHours > 0)
            return (decimal)nightHours * hourlyRate * (nightMultiplier - 1m);

        return 0m;
    }
}
