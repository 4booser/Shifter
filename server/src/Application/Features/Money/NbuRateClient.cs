using System.Globalization;
using System.Text.Json;

using Serilog;

namespace Shifter.Application.Features.Money;

/// <summary>
/// The National Bank's published rates. No key, no account — it is a public
/// statistical endpoint — so this follows the project's optional-integration
/// pattern only in its failure behaviour: everything here returns nothing
/// rather than throwing, and a range that cannot be converted is reported
/// per currency exactly as it was before conversion existed.
/// </summary>
public sealed class NbuRateClient
{
    private readonly IHttpClientFactory _http;

    public NbuRateClient(IHttpClientFactory http) => _http = http;

    /// <summary>
    /// Hryvnia per unit for each code on that day, as far as the bank knows.
    /// A missing code means no rate was published — a weekend, a holiday, or
    /// a currency the bank does not quote — and is left out rather than
    /// filled in with a neighbouring day's number.
    /// </summary>
    public async Task<Dictionary<string, decimal>> RatesAsync(
        IEnumerable<string> codes, DateOnly date, CancellationToken ct)
    {
        var wanted = codes
            .Select(code => code.Trim().ToUpperInvariant())
            .Where(code => code.Length == 3)
            .Distinct()
            .ToArray();

        Dictionary<string, decimal> found = [];

        if (wanted.Length == 0) return found;

        try
        {
            using var client = _http.CreateClient();

            client.Timeout = TimeSpan.FromSeconds(15);

            var url =
                "https://bank.gov.ua/NBUStatService/v1/statdirectory/exchange"
                + $"?date={date:yyyyMMdd}&json";

            using var response = await client.GetAsync(url, ct);

            if (!response.IsSuccessStatusCode)
            {
                Log.Warning("The bank refused a rate list: {Status}", (int)response.StatusCode);

                return found;
            }

            using var document = JsonDocument.Parse(await response.Content.ReadAsStringAsync(ct));

            foreach (var entry in document.RootElement.EnumerateArray())
            {
                if (!entry.TryGetProperty("cc", out var code)) continue;
                if (!entry.TryGetProperty("rate", out var rate)) continue;

                var name = code.GetString()?.ToUpperInvariant();

                if (name is null || !wanted.Contains(name)) continue;

                // The bank quotes some currencies per hundred units; the
                // response says so in r030 only indirectly, so the published
                // "rate" is taken exactly as given and never scaled.
                found[name] = rate.GetDecimal();
            }
        }
        catch (Exception exception)
        {
            Log.Warning(exception, "Could not reach the bank for rates on {Date}", date);
        }

        return found;
    }

    /// <summary>The hryvnia itself, which the bank does not quote against itself.</summary>
    public const decimal Hryvnia = 1m;

    public static string Normalise(string? code)
        => (code ?? string.Empty).Trim().ToUpperInvariant() is { Length: 3 } valid ? valid : "UAH";

    /// <summary>
    /// The rate as a reader would check it: no padded zeros, and a full stop
    /// rather than a comma, because a comma is a different number elsewhere.
    /// </summary>
    public static string Format(decimal rate) => rate.ToString("0.####", CultureInfo.InvariantCulture);
}
