using Shifter.Domain.Entities;

using Xunit;

namespace Shifter.Tests;

public class EventRecurrenceTests
{
    private static Event Repeating(string weekdays, string start, string? until = null) => new()
    {
        Name = "Physio",
        Colour = "#1F3A5F",
        StartDate = DateOnly.Parse(start),
        EndDate = DateOnly.Parse(start),
        RepeatWeekdays = weekdays,
        RepeatUntil = until is null ? null : DateOnly.Parse(until),
    };

    [Fact]
    public void EveryTueThuLandsOnTuesdaysAndThursdays()
    {
        // 2026-03-02 is a Monday; the window is one week.
        var dates = EventRecurrence.Occurrences(
            Repeating("1,3", "2026-03-02"), new DateOnly(2026, 3, 2), new DateOnly(2026, 3, 8));

        Assert.Equal(
            [new DateOnly(2026, 3, 3), new DateOnly(2026, 3, 5)],
            dates.ToArray());
    }

    [Fact]
    public void NothingBeforeTheAnchorDay()
    {
        var dates = EventRecurrence.Occurrences(
            Repeating("0,1,2,3,4,5,6", "2026-03-05"), new DateOnly(2026, 3, 2), new DateOnly(2026, 3, 8));

        Assert.Equal(new DateOnly(2026, 3, 5), dates.First());
    }

    [Fact]
    public void UntilCutsTheTail()
    {
        var dates = EventRecurrence.Occurrences(
            Repeating("0", "2026-03-02", "2026-03-10"), new DateOnly(2026, 3, 1), new DateOnly(2026, 3, 31));

        // Mondays 02 and 09; the 16th falls past the until.
        Assert.Equal(2, dates.Count());
    }

    [Fact]
    public void AOneOffStillAnswersTheSameQuestion()
    {
        var single = new Event
        {
            Name = "Leave",
            Colour = "#1F3A5F",
            StartDate = new DateOnly(2026, 3, 10),
            EndDate = new DateOnly(2026, 3, 12),
        };

        Assert.Single(EventRecurrence.Occurrences(single, new DateOnly(2026, 3, 1), new DateOnly(2026, 3, 31)));
        Assert.Empty(EventRecurrence.Occurrences(single, new DateOnly(2026, 4, 1), new DateOnly(2026, 4, 30)));
    }

    [Fact]
    public void GarbageInTheMaskIsIgnoredNotFatal()
    {
        Assert.Equal([1, 3], EventRecurrence.ParseWeekdays("1,3,9,x,-1").Order().ToArray());
    }
}
