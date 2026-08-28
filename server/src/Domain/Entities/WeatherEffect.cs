namespace Shifter.Domain.Entities;

/// <summary>
/// Whether the weather shows up in somebody's tips.
///
/// Everybody in the trade believes rain kills a night, and nobody has ever
/// checked their own record against the sky. This checks it — on their days,
/// at their place, from measurements neither they nor the app can nudge.
///
/// It compares tips per hour and nothing else. Wage does not move with the
/// weather, so folding it in would water down a real effect until it vanished.
///
/// It reports a coincidence and says so. Rain and a dead Tuesday can share a
/// month without one causing the other, and the wording that comes out of this
/// must never claim otherwise — the honest sentence is "on your wet days you
/// earned less", not "rain costs you money".
/// </summary>
public static class WeatherEffect
{
    /// <summary>
    /// Below this many days on either side there is no comparison, only two
    /// small numbers. Eight is roughly a month of one kind of weather for
    /// somebody working a normal week.
    /// </summary>
    public const int Enough = 8;

    /// <summary>
    /// A gap smaller than this is noise wearing a percentage sign. Tips swing
    /// this much between two dry Fridays.
    /// </summary>
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

    /// <summary>
    /// Null where the record cannot support a sentence: too few days of one
    /// kind of weather, or no hours worked in them.
    ///
    /// Null rather than a verdict with a low confidence flag, so that no screen
    /// can accidentally render the thin version of this as though it were the
    /// solid one.
    /// </summary>
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
