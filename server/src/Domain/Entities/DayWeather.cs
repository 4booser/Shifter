namespace Shifter.Domain.Entities;

/// <summary>
/// What the weather did at a place on a day that has already happened.
///
/// Rain on a Friday is a dead evening, and it is the one external cause a
/// bartender will name without being asked. It is also checkable for nothing:
/// a public archive, coordinates the place already has, no key.
///
/// Recorded rather than forecast, and only for days in the past. A forecast
/// attached to a shift would turn into a prediction about somebody's earnings,
/// which is a different and much worse product.
///
/// Kept forever once written. The weather on the fourteenth of March is the
/// one kind of fact that cannot change, so re-fetching it would only be a way
/// of getting it wrong later.
/// </summary>
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

    /// <summary>
    /// Metres per second. A warm still evening and a warm gale are not the
    /// same evening on a terrace.
    /// </summary>
    public decimal WindMax { get; set; }

    public DateTime FetchedAt { get; set; } = DateTime.UtcNow;

    /// <summary>
    /// Enough water to change whether anybody walks in.
    ///
    /// One millimetre over a day is a passing shower somebody may not have
    /// noticed; the line is drawn where the trade would draw it, and it is
    /// drawn in one place so that no two screens can disagree about what
    /// counts as a wet day.
    /// </summary>
    public const decimal WetMm = 2m;

    public bool Wet => Precipitation >= WetMm;
}
