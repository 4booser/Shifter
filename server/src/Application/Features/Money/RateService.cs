using Microsoft.EntityFrameworkCore;

using Shifter.Domain.Entities;
using Shifter.Infrastructure.Persistence.DbContexts;

namespace Shifter.Application.Features.Money;

/// <summary>
/// What one currency was worth on one day, remembered. The bank is asked at
/// most once per currency per day; after that the answer is a stored fact, so
/// a report reads the same tomorrow as it did today.
/// </summary>
public sealed class RateService
{
    /// <summary>
    /// How far back a stale rate may be stretched. Rates are not published on
    /// weekends and holidays, and refusing to convert a Sunday would make the
    /// feature useless in a trade that works Sundays. Beyond a week the
    /// silence means something else and the money is left unconverted.
    /// </summary>
    private const int StaleDays = 7;

    private readonly ShifterDbContext _db;
    private readonly NbuRateClient _bank;

    public RateService(ShifterDbContext db, NbuRateClient bank)
    {
        _db = db;
        _bank = bank;
    }

    /// <summary>
    /// Hryvnia per unit for each code on that day, with the day each rate
    /// actually came from. A code that comes back missing could not be
    /// converted, which the caller must say out loud rather than quietly
    /// treating as one-to-one.
    /// </summary>
    public async Task<Dictionary<string, (decimal Rate, DateOnly On)>> OnAsync(
        IEnumerable<string> codes, DateOnly date, CancellationToken ct)
    {
        var wanted = codes
            .Select(NbuRateClient.Normalise)
            .Where(code => code != "UAH")
            .Distinct()
            .ToArray();

        Dictionary<string, (decimal, DateOnly)> found = [];

        if (wanted.Length == 0) return found;

        // A rate for a day in the future is not a fact yet; the newest one
        // that exists is the honest answer.
        var asked = date > DateOnly.FromDateTime(DateTime.UtcNow)
            ? DateOnly.FromDateTime(DateTime.UtcNow)
            : date;

        var stored = await _db.ExchangeRates
            .AsNoTracking()
            .Where(rate => wanted.Contains(rate.Code)
                && rate.Date <= asked
                && rate.Date >= asked.AddDays(-StaleDays))
            .ToArrayAsync(ct);

        foreach (var group in stored.GroupBy(rate => rate.Code))
        {
            var newest = group.OrderByDescending(rate => rate.Date).First();

            found[group.Key] = (newest.Rate, newest.Date);
        }

        var missing = wanted.Where(code => !found.ContainsKey(code)).ToArray();

        if (missing.Length > 0)
        {
            // The bank publishes nothing on a weekend, so walk back until
            // something exists — but only within the staleness window, and
            // only for codes we have nothing at all for.
            for (var back = 0; back <= StaleDays && missing.Length > 0; back++)
            {
                var on = asked.AddDays(-back);
                var fetched = await _bank.RatesAsync(missing, on, ct);

                foreach (var (code, rate) in fetched)
                {
                    found[code] = (rate, on);

                    _db.ExchangeRates.Add(new ExchangeRate { Code = code, Date = on, Rate = rate });
                }

                missing = missing.Where(code => !found.ContainsKey(code)).ToArray();
            }

            try
            {
                await _db.SaveChangesAsync(ct);
            }
            catch (DbUpdateException)
            {
                // Two requests raced for the same day. The rate is the same
                // either way; the first one to land wins.
            }
        }

        return found;
    }

    /// <summary>
    /// One amount from one currency into another, through the hryvnia. Both
    /// legs come from the same day's rates, so a cross rate is exact rather
    /// than two conversions rounded twice.
    /// </summary>
    public static decimal? Convert(
        decimal amount,
        string from,
        string to,
        IReadOnlyDictionary<string, (decimal Rate, DateOnly On)> rates)
    {
        from = NbuRateClient.Normalise(from);
        to = NbuRateClient.Normalise(to);

        if (from == to) return amount;

        var fromRate = from == "UAH" ? NbuRateClient.Hryvnia : Look(from, rates);
        var toRate = to == "UAH" ? NbuRateClient.Hryvnia : Look(to, rates);

        if (fromRate is null || toRate is null or 0m) return null;

        return Math.Round(amount * fromRate.Value / toRate.Value, 2);
    }

    private static decimal? Look(
        string code, IReadOnlyDictionary<string, (decimal Rate, DateOnly On)> rates)
        => rates.TryGetValue(code, out var found) ? found.Rate : null;
}
