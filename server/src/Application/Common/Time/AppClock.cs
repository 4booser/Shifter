namespace Shifter.Application.Common.Time;

/// <summary>
/// What day it is where the people using this app are.
///
/// UTC is the right way to store an instant and the wrong way to answer "what
/// is today". Between midnight and three in the morning Kyiv time the UTC date
/// is still yesterday — which is precisely when this trade finishes work. A
/// period that closed yesterday still read as open, a raise looked a day
/// nearer, and a place's current pay period could be named as the last one.
///
/// The zone is configurable and defaults to Kyiv because that is who this is
/// for. A per-person zone is the next step; it belongs on the account, and
/// until it exists one honest default beats UTC by a day.
/// </summary>
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

    /// <summary>
    /// An unknown zone name is not worth a crash: a server missing a tz
    /// database would take the whole app down over a date. UTC is the honest
    /// fallback, and it is the behaviour the app had everywhere before this.
    /// </summary>
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
