using System.Globalization;
using System.Text.Json;

using Serilog;

namespace Shifter.Application.Features.Weather;

/// <summary>
/// The public weather archive, asked only about days that have already been.
///
/// Free, no key, no account — the same shape of dependency as the national
/// bank's rate list, and chosen for the same reason: a feature that needs
/// somebody to register for an API is a feature most people never see.
///
/// It answers about the past. There is a forecast endpoint next to this one
/// and it is deliberately not used: a forecast beside a planned shift becomes
/// a prediction about somebody's earnings, and that is a promise the app has
/// no business making.
/// </summary>
public sealed class OpenMeteoClient
{
    private readonly IHttpClientFactory _http;

    public OpenMeteoClient(IHttpClientFactory http) => _http = http;

    public sealed record DayReading(
        DateOnly Date,
        decimal Precipitation,
        decimal TempMax,
        decimal TempMin,
        decimal WindMax);

    /// <summary>
    /// Daily weather at a point, between two past dates.
    ///
    /// Days the archive has not settled yet come back missing rather than
    /// zeroed. A null in the response means "not measured", and writing that
    /// down as no rain would quietly turn a gap in the record into a dry day.
    /// </summary>
    public async Task<IReadOnlyList<DayReading>> ArchiveAsync(
        double latitude,
        double longitude,
        DateOnly from,
        DateOnly to,
        CancellationToken ct)
    {
        List<DayReading> found = [];

        if (to < from) return found;

        try
        {
            using var client = _http.CreateClient();

            client.Timeout = TimeSpan.FromSeconds(20);

            var url =
                "https://archive-api.open-meteo.com/v1/archive"
                + $"?latitude={latitude.ToString("0.####", CultureInfo.InvariantCulture)}"
                + $"&longitude={longitude.ToString("0.####", CultureInfo.InvariantCulture)}"
                + $"&start_date={from:yyyy-MM-dd}&end_date={to:yyyy-MM-dd}"
                + "&daily=precipitation_sum,temperature_2m_max,temperature_2m_min,wind_speed_10m_max"
                + "&timezone=auto";

            using var response = await client.GetAsync(url, ct);

            if (!response.IsSuccessStatusCode)
            {
                Log.Warning("The weather archive refused a range: {Status}", (int)response.StatusCode);

                return found;
            }

            using var document = JsonDocument.Parse(await response.Content.ReadAsStringAsync(ct));

            if (!document.RootElement.TryGetProperty("daily", out var daily)) return found;
            if (!daily.TryGetProperty("time", out var times)) return found;

            var dates = times.EnumerateArray().Select(item => item.GetString()).ToArray();

            var rain = Column(daily, "precipitation_sum", dates.Length);
            var high = Column(daily, "temperature_2m_max", dates.Length);
            var low = Column(daily, "temperature_2m_min", dates.Length);
            var wind = Column(daily, "wind_speed_10m_max", dates.Length);

            for (var index = 0; index < dates.Length; index += 1)
            {
                if (!DateOnly.TryParse(dates[index], out var date)) continue;

                // A day the archive has not finished measuring is left out
                // rather than filled in with a zero that reads as fine weather.
                if (rain[index] is not decimal fell) continue;
                if (high[index] is not decimal warmest) continue;

                found.Add(new DayReading(
                    date,
                    fell,
                    warmest,
                    low[index] ?? warmest,
                    wind[index] ?? 0m));
            }
        }
        catch (Exception exception)
        {
            Log.Warning(exception, "Could not reach the weather archive for {From}..{To}", from, to);
        }

        return found;
    }

    private static decimal?[] Column(JsonElement daily, string name, int length)
    {
        var column = new decimal?[length];

        if (!daily.TryGetProperty(name, out var values)) return column;

        var index = 0;

        foreach (var item in values.EnumerateArray())
        {
            if (index >= length) break;

            column[index] = item.ValueKind == JsonValueKind.Number ? item.GetDecimal() : null;

            index += 1;
        }

        return column;
    }
}
