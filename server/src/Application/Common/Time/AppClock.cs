namespace Shifter.Application.Common.Time;

/// <summary>What day it is where the people using this app are.</summary>
public sealed class AppClock
{
    public const string DefaultZone = "Europe/Kyiv";

    private readonly TimeZoneInfo _zone;
    private readonly TimeProvider _time;

    public AppClock(string? zoneId = null, TimeProvider? time = null)
    {
        _zone = Resolve(zoneId ?? DefaultZone);
        _time = time ?? TimeProvider.System;
    }

    /// <summary>The zone this clock reads, for anybody who has not said where they are.</summary>
    public TimeZoneInfo Zone => _zone;

    public DateTime UtcNow => _time.GetUtcNow().UtcDateTime;

    /// <summary>The wall clock, where the work happens.</summary>
    public DateTime Now => TimeZoneInfo.ConvertTime(_time.GetUtcNow(), _zone).DateTime;

    /// <summary>The date, where the work happens.</summary>
    public DateOnly Today => DateOnly.FromDateTime(Now);

    /// <summary>The zone a person's device named, or this clock's own when the name means nothing here.</summary>
    public TimeZoneInfo ZoneOr(string? id)
    {
        if (string.IsNullOrWhiteSpace(id)) return _zone;

        try
        {
            return TimeZoneInfo.FindSystemTimeZoneById(id);
        }
        catch (Exception exception)
            when (exception is TimeZoneNotFoundException or InvalidTimeZoneException)
        {
            return _zone;
        }
    }

    /// <summary>The instant a wall clock reading names, for the two readings a change of the clocks makes awkward.</summary>
    public static DateTime ToUtc(DateTime local, TimeZoneInfo zone)
    {
        DateTime wall = DateTime.SpecifyKind(local, DateTimeKind.Unspecified);

        // The hour skipped in spring never happened, so it is read on the
        // offset from before the jump, and the hour repeated in autumn
        // happened twice, so it is read as the later one: a shift ending
        // inside either is never called over before it really is.
        TimeSpan offset = zone.IsInvalidTime(wall)
            ? zone.GetUtcOffset(wall.AddDays(-1))
            : zone.IsAmbiguousTime(wall)
                ? zone.GetAmbiguousTimeOffsets(wall).Min()
                : zone.GetUtcOffset(wall);

        return DateTime.SpecifyKind(wall - offset, DateTimeKind.Utc);
    }

    /// <summary>An unknown zone name is not worth a crash: a server missing a tz database would take the whole app down over…</summary>
    private static TimeZoneInfo Resolve(string id)
    {
        try
        {
            return TimeZoneInfo.FindSystemTimeZoneById(id);
        }
        catch (Exception exception)
            when (exception is TimeZoneNotFoundException or InvalidTimeZoneException)
        {
            return TimeZoneInfo.Utc;
        }
    }
}
