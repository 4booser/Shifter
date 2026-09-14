using System.Globalization;
using System.Text.RegularExpressions;

namespace Shifter.Domain.Entities;

/// <summary>A job advert read into the beginnings of a shift template.</summary>
public static class JobAdvert
{
    public sealed record Read(
        decimal? PayAmount,
        /// <summary>"hour", "shift", "month" — or null where the advert did not say.</summary>
        string? PayPeriod,
        /// <summary>Percent of sales on top, where the advert offers one.</summary>
        decimal? Percent,
        TimeOnly? Start,
        TimeOnly? End,
        /// <summary>Minutes of unpaid break, where the advert states one.</summary>
        int? BreakMinutes);

    private static readonly TimeSpan Timeout = TimeSpan.FromMilliseconds(200);

    /// <summary>A match, or nothing, but never an exception.</summary>
    private static Match? Scan(Regex pattern, string body)
    {
        try
        {
            var match = pattern.Match(body);

            return match.Success ? match : null;
        }
        catch (RegexMatchTimeoutException)
        {
            return null;
        }
    }

    /// <summary>"10:00–22:00", "з 10.00 до 22.00", "10-22".</summary>
    private static readonly Regex Span = new(
        @"(?<h1>[0-2]?\d)[:.](?<m1>[0-5]\d)\s*(?:-|–|—|до|to|по)\s*(?<h2>[0-2]?\d)[:.](?<m2>[0-5]\d)",
        RegexOptions.IgnoreCase | RegexOptions.Compiled, Timeout);

    /// <summary>The wage and what it is per.</summary>
    private static readonly Regex Pay = new(
        // The low end of a range is captured too, and it is the one used. An
        // advert's upper figure is the marketing one; the lower is what a new
        // person is actually offered, and it can never overstate a wage.
        @"(?:(?<low>\d[\d\s  ]{0,9}(?:[.,]\d{1,2})?)\s*(?:-|–|—)\s*)?"
        + @"(?<amount>\d[\d\s  ]{0,9}(?:[.,]\d{1,2})?)\s*"
        + @"(?:грн|₴|uah|zł|pln|€|eur|\$|usd)?\s*"
        + @"(?:/|за|на|в|per)?\s*"
        + @"(?<unit>годину|годин|година|год|час(?:ов|а)?|hour|hr|зміну|зміна|смену|смена|shift|день|day|місяць|месяц|month)",
        RegexOptions.IgnoreCase | RegexOptions.Compiled, Timeout);

    /// <summary>A share of the till, and only that.</summary>
    private static readonly Regex Share = new(
        @"(?<percent>\d{1,2}(?:[.,]\d)?)\s*%[^.\n]{0,30}?"
        + @"(?:продаж|прода[её]|вируч|выруч|товарооб|обіг|оборот|бар\b|бару|кухн|чек|каси|касс|sales|turnover|revenue|bar\b)",
        RegexOptions.IgnoreCase | RegexOptions.Compiled, Timeout);

    private static readonly Regex Break = new(
        @"(?:перерв\w*|перерыв\w*|обід\w*|обед\w*|break)\D{0,20}?(?<minutes>\d{2,3})\s*(?:хв|мин|min)",
        RegexOptions.IgnoreCase | RegexOptions.Compiled, Timeout);

    public static Read Parse(string? text)
    {
        var body = text ?? string.Empty;

        if (body.Length > 20_000) body = body[..20_000];

        var (amount, period) = ReadPay(body);

        return new Read(amount, period, ReadPercent(body), ReadStart(body), ReadEnd(body), ReadBreak(body));
    }

    private static (decimal?, string?) ReadPay(string body)
    {
        var match = Scan(Pay, body);

        if (match is null) return (null, null);

        var group = match.Groups["low"].Success ? "low" : "amount";

        var digits = match.Groups[group].Value
            .Replace(" ", string.Empty)
            .Replace(" ", string.Empty)
            .Replace(',', '.');

        if (!decimal.TryParse(digits, NumberStyles.Number, CultureInfo.InvariantCulture, out var amount))
            return (null, null);

        // A rate of nothing is not a rate, and neither is a phone number that
        // happened to sit next to the word "день".
        if (amount <= 0m || amount > 10_000_000m) return (null, null);

        var unit = match.Groups["unit"].Value.ToLowerInvariant();

        var period = unit.StartsWith("год") || unit.StartsWith("час") || unit.StartsWith("hour") || unit == "hr"
            ? "hour"
            : unit.StartsWith("міс") || unit.StartsWith("мес") || unit.StartsWith("month")
                ? "month"
                : "shift";

        return (amount, period);
    }

    private static decimal? ReadPercent(string body)
    {
        var match = Scan(Share, body);

        if (match is null) return null;

        if (!decimal.TryParse(
                match.Groups["percent"].Value.Replace(',', '.'),
                NumberStyles.Number, CultureInfo.InvariantCulture, out var percent))
            return null;

        // Even beside the right word, a share of the till in this trade is
        // single digits and occasionally low double. Above thirty it is
        // something else that happened to be phrased the same way.
        return percent is > 0m and <= 30m ? percent : null;
    }

    private static TimeOnly? ReadStart(string body) => ReadSpan(body)?.Start;

    private static TimeOnly? ReadEnd(string body) => ReadSpan(body)?.End;

    private static (TimeOnly Start, TimeOnly End)? ReadSpan(string body)
    {
        var match = Scan(Span, body);

        if (match is null) return null;

        var h1 = int.Parse(match.Groups["h1"].Value);
        var h2 = int.Parse(match.Groups["h2"].Value);

        if (h1 > 23 || h2 > 23) return null;

        return (
            new TimeOnly(h1, int.Parse(match.Groups["m1"].Value)),
            new TimeOnly(h2, int.Parse(match.Groups["m2"].Value)));
    }

    private static int? ReadBreak(string body)
    {
        var match = Scan(Break, body);

        if (match is null) return null;

        var minutes = int.Parse(match.Groups["minutes"].Value);

        // A break longer than four hours is a split shift, which is a
        // different thing and one this cannot read.
        return minutes is > 0 and <= 240 ? minutes : null;
    }
}
