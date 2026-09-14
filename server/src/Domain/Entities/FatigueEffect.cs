namespace Shifter.Domain.Entities;

/// <summary>Whether a long run of days shows up in somebody's tips.</summary>
public static class FatigueEffect
{
    /// <summary>Same floor as WeatherEffect: fewer days than this is not a comparison.</summary>
    public const int Enough = 8;

    /// <summary>Same noise floor as the weather: tips swing this much anyway.</summary>
    public const decimal Noticeable = 0.12m;

    /// <summary>A run day at or past this position counts as deep.</summary>
    public const int DeepFrom = 6;

    /// <summary>Fresh means the first or second day of a run.</summary>
    public const int FreshTo = 2;

    public sealed record DayFigures(DateOnly Date, decimal? Tips, double Hours);

    public sealed record Verdict(
        int FreshDays,
        int DeepDays,
        decimal FreshPerHour,
        decimal DeepPerHour,
        /// <summary>Signed: −18 means deep days ran eighteen per cent lower.</summary>
        int Percent,
        /// <summary>False where the two sides differ by too little to mention.</summary>
        bool IsNoticeable);

    public static Verdict? Read(IReadOnlyCollection<DayFigures> days)
    {
        var positions = WorkStreaks.Positions(days.Select(day => day.Date));

        var usable = days
            .Where(day => day.Tips is not null && day.Hours > 0)
            .Select(day => new { day, Position = positions[day.Date] })
            .ToArray();

        var fresh = usable.Where(row => row.Position <= FreshTo).ToArray();
        var deep = usable.Where(row => row.Position >= DeepFrom).ToArray();

        if (fresh.Length < Enough || deep.Length < Enough) return null;

        var freshPerHour = fresh.Sum(row => row.day.Tips!.Value) / (decimal)fresh.Sum(row => row.day.Hours);
        var deepPerHour = deep.Sum(row => row.day.Tips!.Value) / (decimal)deep.Sum(row => row.day.Hours);

        if (freshPerHour <= 0) return null;

        var change = (deepPerHour - freshPerHour) / freshPerHour;

        return new Verdict(
            fresh.Length,
            deep.Length,
            Math.Round(freshPerHour, 2),
            Math.Round(deepPerHour, 2),
            (int)Math.Round(change * 100),
            Math.Abs(change) >= Noticeable);
    }
}
