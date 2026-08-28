using System.Text.Json;

using Serilog;

namespace Shifter.Application.Features.Money;

/// <summary>
/// The rate somebody will actually be given, beside the rate the state
/// publishes.
///
/// The national bank's number is the official one and the right basis for a
/// report. It is not the number a person gets when they walk into a branch
/// with euros, and the gap between the two is real money on a month's wages
/// earned abroad.
///
/// So both are shown, each named. This one never replaces the other quietly:
/// a figure that changed source without saying so is worse than a figure that
/// is merely approximate.
///
/// Public endpoint, no token, and a hard limit of one call per five minutes on
/// the bank's side — so the answer is held and shared rather than fetched per
/// request. Registered as a singleton for exactly that reason.
/// </summary>
public sealed class MonoRateClient
{
    private readonly IHttpClientFactory _http;
    private readonly SemaphoreSlim _gate = new(1, 1);

    private Dictionary<string, Quote> _held = [];
    private DateTime _heldAt = DateTime.MinValue;

    public MonoRateClient(IHttpClientFactory http) => _http = http;

    /// <summary>
    /// The bank refuses more often than this, so asking more often than this
    /// buys nothing but a rejection. Six minutes leaves room for clock drift.
    /// </summary>
    private static readonly TimeSpan Hold = TimeSpan.FromMinutes(6);

    /// <summary>
    /// What the bank will buy a unit of this currency for, and sell it for,
    /// in hryvnia.
    /// </summary>
    public sealed record Quote(decimal Buy, decimal Sell, DateOnly On);

    /// <summary>ISO 4217 numbers for the currencies this app converts.</summary>
    private static readonly Dictionary<int, string> Codes = new()
    {
        [840] = "USD",
        [978] = "EUR",
        [985] = "PLN",
        [826] = "GBP",
        [203] = "CZK",
        [946] = "RON",
        [944] = "AZN",
        [981] = "GEL",
        [949] = "TRY",
        [124] = "CAD",
        [756] = "CHF",
    };

    private const int Hryvnia = 980;

    /// <summary>
    /// Every quote the bank publishes against the hryvnia, or what is left
    /// over from the last successful call.
    ///
    /// A stale quote is served rather than nothing: the alternative to a rate
    /// from six minutes ago is no second opinion at all, and the date travels
    /// with the number so nobody has to guess how old it is.
    /// </summary>
    public async Task<IReadOnlyDictionary<string, Quote>> QuotesAsync(CancellationToken ct)
    {
        if (DateTime.UtcNow - _heldAt < Hold) return _held;

        await _gate.WaitAsync(ct);

        try
        {
            // Somebody else may have refreshed it while this call was queued.
            if (DateTime.UtcNow - _heldAt < Hold) return _held;

            using var client = _http.CreateClient();

            client.Timeout = TimeSpan.FromSeconds(10);

            using var response = await client.GetAsync("https://api.monobank.ua/bank/currency", ct);

            if (!response.IsSuccessStatusCode)
            {
                Log.Warning("The bank refused its rate list: {Status}", (int)response.StatusCode);

                // Held back rather than cleared. A refusal is usually the rate
                // limit, and throwing away good numbers because of it would
                // make the second opinion vanish exactly when it is asked for
                // most.
                return _held;
            }

            using var document = JsonDocument.Parse(await response.Content.ReadAsStringAsync(ct));

            Dictionary<string, Quote> found = [];

            foreach (var entry in document.RootElement.EnumerateArray())
            {
                if (!entry.TryGetProperty("currencyCodeA", out var a)) continue;
                if (!entry.TryGetProperty("currencyCodeB", out var b)) continue;

                if (b.GetInt32() != Hryvnia) continue;
                if (!Codes.TryGetValue(a.GetInt32(), out var code)) continue;

                if (ReadQuote(entry) is { } quote) found[code] = quote;
            }

            if (found.Count > 0)
            {
                _held = found;
                _heldAt = DateTime.UtcNow;
            }

            return _held;
        }
        catch (Exception exception)
        {
            Log.Warning(exception, "Could not reach the bank for its own rates");

            return _held;
        }
        finally
        {
            _gate.Release();
        }
    }

    /// <summary>
    /// One published pair, or nothing.
    ///
    /// Thinly traded currencies come with a single cross rate and no buy or
    /// sell at all. One number is still an answer; a zero in its place would
    /// be a lie with a decimal point in it, and it would be read as "the bank
    /// will give you nothing for these".
    /// </summary>
    public static Quote? ReadQuote(JsonElement entry)
    {
        var buy = Read(entry, "rateBuy") ?? Read(entry, "rateCross");
        var sell = Read(entry, "rateSell") ?? Read(entry, "rateCross");

        if (buy is not decimal bought || sell is not decimal sold) return null;
        if (bought <= 0m || sold <= 0m) return null;

        var on = entry.TryGetProperty("date", out var stamp) && stamp.ValueKind == JsonValueKind.Number
            ? DateOnly.FromDateTime(DateTimeOffset.FromUnixTimeSeconds(stamp.GetInt64()).UtcDateTime)
            : DateOnly.FromDateTime(DateTime.UtcNow);

        return new Quote(bought, sold, on);
    }

    private static decimal? Read(JsonElement entry, string name)
        => entry.TryGetProperty(name, out var value) && value.ValueKind == JsonValueKind.Number
            ? value.GetDecimal()
            : null;
}
