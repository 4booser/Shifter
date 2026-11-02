namespace Shifter.Domain.Entities;

/// <summary>When one placed shift opens and closes on the wall clock.</summary>
// The web and the phone carry this same rule, with the same vectors in their
// tests: the server closing a shift and a client watching it close have to
// agree to the minute, so a change here is a change in all three.
public readonly record struct ShiftWindow(DateTime Opens, DateTime Closes)
{
    private static readonly TimeSpan HalfDay = TimeSpan.FromHours(12);

    /// <summary>An overnight shift belongs to the date it starts on, so a date and its plan are enough to place both edges.</summary>
    public static ShiftWindow Of(
        DateOnly date,
        TimeOnly start,
        TimeOnly end,
        TimeOnly? actualStart = null,
        TimeOnly? actualEnd = null)
    {
        DateTime planStart = date.ToDateTime(start);
        DateTime planEnd = date.ToDateTime(end);

        if (end <= start) planEnd = planEnd.AddDays(1);

        DateTime opens = actualStart is TimeOnly began ? Nearest(began, planStart) : planStart;
        DateTime closes = actualEnd is TimeOnly ended ? Nearest(ended, planEnd) : planEnd;

        return new ShiftWindow(opens, closes <= opens ? closes.AddDays(1) : closes);
    }

    public static ShiftWindow Of(DateOnly date, DayShift entry)
        => Of(date, entry.StartTime, entry.EndTime, entry.ActualStart, entry.ActualEnd);

    /// <summary>The moment a start with no end beside it fell after its plan was over, or null for any other placement.</summary>
    // Of reads a start against the plan's start, which suits one typed a little
    // early or late. A shift moved to the evening is neither: on a plan of
    // 09:00 to 17:00, 18:00 pushes the plan's end round to tomorrow and 22:00
    // lands on the evening before, and either close would pay hours nobody
    // worked. So this reads the start against the whole plan, on whichever side
    // it sits closer to. An end said beside it is an answer, and Of takes that.
    public static DateTime? StartedAfterPlan(
        DateOnly date,
        TimeOnly start,
        TimeOnly end,
        TimeOnly? actualStart,
        TimeOnly? actualEnd)
    {
        if (actualStart is not TimeOnly began || actualEnd is not null) return null;

        ShiftWindow plan = Of(date, start, end);

        DateTime after = plan.Closes.Date + began.ToTimeSpan();

        if (after < plan.Closes) after = after.AddDays(1);

        DateTime before = after.AddDays(-1);

        if (before >= plan.Opens) return null;

        // Exactly between the two is a tie, and the later one takes it.
        return after - plan.Closes <= plan.Opens - before ? after : null;
    }

    /// <summary>The occurrence of a clock time closest to the plan: an edge typed as 00:30 on a night shift means the 00:30 inside that night, not the one a day earlier.</summary>
    private static DateTime Nearest(TimeOnly time, DateTime anchor)
    {
        DateTime found = anchor.Date + time.ToTimeSpan();
        TimeSpan off = found - anchor;

        // Exactly twelve hours either way is a tie, and the later one takes it.
        if (off <= -HalfDay) return found.AddDays(1);
        if (off > HalfDay) return found.AddDays(-1);

        return found;
    }
}
