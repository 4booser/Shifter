namespace Shifter.Domain.Entities;

/// <summary>Whether the weather shows up in somebody's tips.</summary>
public static class WeatherEffect
{
    /// <summary>Below this many days on either side there is no comparison, only two small numbers.</summary>
    public const int Enough = 8;

    /// <summary>A gap smaller than this is noise wearing a percentage sign.</summary>
    public const decimal Noticeable = 0.12m;

    public sealed record Verdict(
        int WetDays,
        int DryDays,
        decimal WetPerHour,
        decimal DryPerHour,
        /// <summary>Signed: −18 means wet days ran eighteen per cent lower.</summary>
        int Percent,
        /// <summary>False where the two sides differ by too little to mention.</summary>
        bool Worth);

    public sealed record DayFigures(DateOnly Date, decimal Tips, double Hours, bool Wet);

    /// <summary>Null where the record cannot support a sentence: too few days of one kind of weather, or no hours worked in…</summary>
    public static Verdict? Read(IEnumerable<DayFigures> days)
    {
        var worked = days.Where(day => day.Hours > 0).ToArray();

        var wet = worked.Where(day => day.Wet).ToArray();
        var dry = worked.Where(day => !day.Wet).ToArray();

        if (wet.Length < Enough || dry.Length < Enough) return null;

        var wetHours = (decimal)wet.Sum(day => day.Hours);
        var dryHours = (decimal)dry.Sum(day => day.Hours);

        if (wetHours <= 0 || dryHours <= 0) return null;

        // Per hour rather than per day: a rainy Sunday double is not evidence
        // that rain pays, it is evidence that the shift was longer.
        var wetRate = wet.Sum(day => day.Tips) / wetHours;
        var dryRate = dry.Sum(day => day.Tips) / dryHours;

        if (dryRate <= 0) return null;

        var change = (wetRate - dryRate) / dryRate;

        return new Verdict(
            wet.Length,
            dry.Length,
            Math.Round(wetRate, 2),
            Math.Round(dryRate, 2),
            (int)Math.Round(change * 100),
            Math.Abs(change) >= Noticeable);
    }
}
