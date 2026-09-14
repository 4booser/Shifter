using Microsoft.EntityFrameworkCore;

using Serilog;

using Shifter.Domain.Entities;
using Shifter.Infrastructure.Persistence.DbContexts;

namespace Shifter.Application.Features.Weather;

/// <summary>Reads somebody's own record against the sky over their own place.</summary>
public sealed class WeatherService
{
    private readonly ShifterDbContext _db;
    private readonly OpenMeteoClient _archive;

    public WeatherService(ShifterDbContext db, OpenMeteoClient archive)
    {
        _db = db;
        _archive = archive;
    }

    /// <summary>How far back the comparison looks.</summary>
    private const int Years = 2;

    public sealed record PlaceWeather(
        int LocationId,
        string Place,
        WeatherEffect.Verdict Verdict);

    /// <summary>One reading per place with enough recorded weather to support one.</summary>
    public async Task<IReadOnlyList<PlaceWeather>> ReadAsync(
        int userId, DateOnly today, CancellationToken ct)
    {
        var from = today.AddYears(-Years);

        // Yesterday, not today: the archive settles a day after it ends, and
        // asking about today reliably gets a gap back.
        var to = today.AddDays(-1);

        var places = await _db.Locations
            .AsNoTracking()
            .Where(place => place.UserId == userId
                && place.Latitude != null
                && place.Longitude != null)
            .Select(place => new { place.Id, place.Name, place.Latitude, place.Longitude })
            .ToArrayAsync(ct);

        if (places.Length == 0) return [];

        var worked = await _db.DayShifts
            .AsNoTracking()
            .Where(entry => entry.Worked
                && entry.Day!.UserId == userId
                && entry.Day.Date >= from
                && entry.Day.Date <= to
                && entry.Shift!.LocationId != null)
            .Select(entry => new
            {
                Date = entry.Day!.Date,
                LocationId = entry.Shift!.LocationId!.Value,
                Tips = entry.Day.Tips ?? 0m,
                // The placement itself, so the paid hours come from the one
                // property that already knows about breaks and about the times
                // somebody actually clocked rather than the ones planned.
                Placement = entry,
            })
            .ToArrayAsync(ct);

        List<PlaceWeather> readings = [];

        foreach (var place in places)
        {
            var days = worked
                .Where(entry => entry.LocationId == place.Id)
                .GroupBy(entry => entry.Date)
                // A day with two shifts at one place has one lot of tips and
                // one lot of weather; counting it twice would let a double
                // shift vote twice on what the rain does.
                .Select(group => new
                {
                    Date = group.Key,
                    Tips = group.First().Tips,
                    Hours = group.Sum(entry => entry.Placement.PaidDuration.TotalHours),
                })
                .ToArray();

            if (days.Length < WeatherEffect.Enough * 2) continue;

            var weather = await FillAsync(
                place.Id,
                place.Latitude!.Value,
                place.Longitude!.Value,
                days.Min(day => day.Date),
                days.Max(day => day.Date),
                ct);

            var figures = days
                .Where(day => weather.ContainsKey(day.Date))
                .Select(day => new WeatherEffect.DayFigures(
                    day.Date, day.Tips, day.Hours, weather[day.Date]))
                .ToArray();

            if (WeatherEffect.Read(figures) is not { } verdict) continue;

            readings.Add(new PlaceWeather(place.Id, place.Name, verdict));
        }

        return readings;
    }

    /// <summary>The weather already known, plus whatever is missing, fetched once.</summary>
    private async Task<Dictionary<DateOnly, bool>> FillAsync(
        int locationId,
        double latitude,
        double longitude,
        DateOnly from,
        DateOnly to,
        CancellationToken ct)
    {
        var stored = await _db.DayWeather
            .AsNoTracking()
            .Where(row => row.LocationId == locationId && row.Date >= from && row.Date <= to)
            .ToArrayAsync(ct);

        var known = stored.ToDictionary(row => row.Date, row => row.Wet);

        // Roughly a full range already in hand: the missing days are the ones
        // the archive itself had no measurement for, and asking again would
        // spend a request to be told the same thing.
        var span = to.DayNumber - from.DayNumber + 1;

        if (known.Count >= span - 3) return known;

        var readings = await _archive.ArchiveAsync(latitude, longitude, from, to, ct);

        if (readings.Count == 0) return known;

        foreach (var reading in readings)
        {
            if (known.ContainsKey(reading.Date)) continue;

            _db.DayWeather.Add(new DayWeather
            {
                LocationId = locationId,
                Date = reading.Date,
                Precipitation = reading.Precipitation,
                TempMax = reading.TempMax,
                TempMin = reading.TempMin,
                WindMax = reading.WindMax,
            });

            known[reading.Date] = reading.Precipitation >= DayWeather.WetMm;
        }

        try
        {
            await _db.SaveChangesAsync(ct);
        }
        catch (DbUpdateException exception)
        {
            // Two tabs asking at once race on the unique index. The reading is
            // still correct — it is in hand — so the page is served rather
            // than failed over a row somebody else has already written.
            Log.Warning(exception, "Weather for {Place} was written by someone else first", locationId);

            _db.ChangeTracker.Clear();
        }

        return known;
    }
}
