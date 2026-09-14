namespace Shifter.Domain.Entities;

/// <summary>What the weather did at a place on a day that has already happened.</summary>
public sealed class DayWeather
{
    public int Id { get; set; }

    public int LocationId { get; set; }
    public Location? Location { get; set; }

    public required DateOnly Date { get; set; }

    /// <summary>Millimetres over the whole day.</summary>
    public decimal Precipitation { get; set; }

    /// <summary>Degrees Celsius.</summary>
    public decimal TempMax { get; set; }
    public decimal TempMin { get; set; }

    /// <summary>Metres per second.</summary>
    public decimal WindMax { get; set; }

    public DateTime FetchedAt { get; set; } = DateTime.UtcNow;

    /// <summary>Enough water to change whether anybody walks in.</summary>
    public const decimal WetMm = 2m;

    public bool Wet => Precipitation >= WetMm;
}
