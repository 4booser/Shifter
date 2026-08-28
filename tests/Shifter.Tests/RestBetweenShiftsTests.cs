using Shifter.Domain.Entities;

using Xunit;

namespace Shifter.Tests;

/// <summary>
/// Closing at two and opening at eight. The app already spotted the habit and
/// counted it, and counting is the part that stops working — by the third one
/// in a fortnight it stops feeling unusual. What a person repeats out loud is
/// the size of the shortest one.
/// </summary>
public class RestBetweenShiftsTests
{
    private static (DateTime Start, DateTime End) Span(string start, string end)
        => (DateTime.Parse(start), DateTime.Parse(end));

    [Fact]
    public void A_close_and_an_open_is_found_across_the_midnight_between_them()
    {
        var rests = RestBetweenShifts.Find(
        [
            Span("2026-03-02 16:00", "2026-03-03 02:00"),
            Span("2026-03-03 09:00", "2026-03-03 17:00"),
        ]);

        var only = Assert.Single(rests);

        Assert.Equal(7, only.Hours);
        Assert.Equal(new DateOnly(2026, 3, 3), only.After);
    }

    [Fact]
    public void A_proper_night_between_shifts_is_not_reported()
    {
        var rests = RestBetweenShifts.Find(
        [
            Span("2026-03-02 10:00", "2026-03-02 18:00"),
            Span("2026-03-03 10:00", "2026-03-03 18:00"),
        ]);

        Assert.Empty(rests);
    }

    [Fact]
    public void The_threshold_is_the_persons_own()
    {
        var spans = new[]
        {
            Span("2026-03-02 16:00", "2026-03-03 00:00"),
            Span("2026-03-03 09:00", "2026-03-03 17:00"),
        };

        // Nine hours: short by the EU rule, fine for somebody who said eight.
        Assert.Single(RestBetweenShifts.Find(spans));
        Assert.Empty(RestBetweenShifts.Find(spans, threshold: 8));
    }

    [Fact]
    public void Shifts_that_overlap_are_not_a_short_rest_at_all()
    {
        // Two places on one evening, recorded as overlapping. There is no gap
        // between them to be short, and calling it one would be inventing a
        // rest that never happened.
        var rests = RestBetweenShifts.Find(
        [
            Span("2026-03-02 10:00", "2026-03-02 20:00"),
            Span("2026-03-02 18:00", "2026-03-02 23:00"),
        ]);

        Assert.Empty(rests);
    }

    [Fact]
    public void A_short_shift_inside_a_long_one_does_not_reset_the_clock()
    {
        // The gap that matters runs from the end of the *longest* thing so
        // far, not from whichever span happened to be read last.
        var rests = RestBetweenShifts.Find(
        [
            Span("2026-03-02 08:00", "2026-03-02 23:00"),
            Span("2026-03-02 12:00", "2026-03-02 14:00"),
            Span("2026-03-03 06:00", "2026-03-03 14:00"),
        ]);

        var only = Assert.Single(rests);

        Assert.Equal(7, only.Hours);
    }

    [Fact]
    public void The_shortest_is_the_one_worth_saying()
    {
        var rests = RestBetweenShifts.Find(
        [
            Span("2026-03-02 16:00", "2026-03-03 02:00"),
            Span("2026-03-03 09:00", "2026-03-03 17:00"),
            Span("2026-03-04 01:00", "2026-03-04 09:00"),
        ]);

        Assert.Equal(2, rests.Count);
        Assert.Equal(7, RestBetweenShifts.Shortest(rests));
        Assert.Null(RestBetweenShifts.Shortest([]));
    }

    [Fact]
    public void One_shift_on_its_own_has_nothing_to_compare_against()
    {
        Assert.Empty(RestBetweenShifts.Find([Span("2026-03-02 10:00", "2026-03-02 18:00")]));
        Assert.Empty(RestBetweenShifts.Find([]));
    }
}
