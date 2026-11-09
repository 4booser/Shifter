using Shifter.Application.Common.Time;

using Xunit;

namespace Shifter.Tests;

/// <summary>The clock stays what it was and can now be stopped for a test.</summary>
public class AppClockTests
{
    private static readonly TimeZoneInfo Kyiv = TimeZoneInfo.FindSystemTimeZoneById("Europe/Kyiv");

    private static AppClock At(string instant, string? zone = null)
        => new(zone, new FixedTime(DateTimeOffset.Parse(instant)));

    [Fact]
    public void Now_and_today_are_read_where_the_work_happens()
    {
        // Half past midnight in Kyiv, still the day before in UTC.
        AppClock clock = At("2026-08-04T21:30:00Z");

        Assert.Equal(new DateTime(2026, 8, 5, 0, 30, 0), clock.Now);
        Assert.Equal(new DateOnly(2026, 8, 5), clock.Today);
        Assert.Equal(new DateTime(2026, 8, 4, 21, 30, 0, DateTimeKind.Utc), clock.UtcNow);
    }

    [Fact]
    public void Left_alone_it_reads_the_system_clock()
    {
        DateOnly expected = DateOnly.FromDateTime(
            TimeZoneInfo.ConvertTime(DateTimeOffset.UtcNow, Kyiv).DateTime);

        Assert.Equal(expected, new AppClock().Today);
    }

    [Fact]
    public void An_unknown_zone_on_a_device_falls_back_to_the_clock_itself()
    {
        AppClock clock = At("2026-08-04T12:00:00Z", "Europe/Warsaw");

        Assert.Equal(clock.Zone, clock.ZoneOr("Mars/Olympus"));
        Assert.Equal(clock.Zone, clock.ZoneOr(null));
        Assert.Equal(clock.Zone, clock.ZoneOr(""));
        Assert.Equal("Asia/Tokyo", clock.ZoneOr("Asia/Tokyo").Id);
    }

    [Fact]
    public void An_ordinary_reading_converts_on_its_own_offset()
        => Assert.Equal(
            new DateTime(2026, 7, 1, 19, 0, 0, DateTimeKind.Utc),
            AppClock.ToUtc(new DateTime(2026, 7, 1, 22, 0, 0), Kyiv));

    [Fact]
    public void A_minute_the_spring_clock_skips_does_not_throw_and_lands_past_the_gap()
    {
        // 03:00 became 04:00 in Kyiv on the last Sunday of March.
        DateTime skipped = new(2026, 3, 29, 3, 30, 0);

        Assert.True(Kyiv.IsInvalidTime(skipped));

        // 04:30 local on the far side, an hour past the moment that was typed.
        Assert.Equal(
            new DateTime(2026, 3, 29, 1, 30, 0, DateTimeKind.Utc),
            AppClock.ToUtc(skipped, Kyiv));
    }

    [Fact]
    public void A_minute_the_autumn_clock_repeats_is_read_as_the_later_one()
    {
        // 04:00 went back to 03:00 in Kyiv on the last Sunday of October.
        DateTime repeated = new(2026, 10, 25, 3, 30, 0);

        Assert.True(Kyiv.IsAmbiguousTime(repeated));

        Assert.Equal(
            new DateTime(2026, 10, 25, 1, 30, 0, DateTimeKind.Utc),
            AppClock.ToUtc(repeated, Kyiv));
    }
}
