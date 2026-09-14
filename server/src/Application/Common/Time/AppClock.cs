namespace Shifter.Application.Common.Time;

/// <summary>What day it is where the people using this app are.</summary>
public sealed class AppClock
{
    public const string DefaultZone = "Europe/Kyiv";

    private readonly TimeZoneInfo _zone;

    public AppClock(string? zoneId = null)
    {
        _zone = Resolve(zoneId ?? DefaultZone);
    }

    /// <summary>The date, where the work happens.</summary>
    public DateOnly Today => DateOnly.FromDateTime(
        TimeZoneInfo.ConvertTime(DateTimeOffset.UtcNow, _zone).Date);

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
