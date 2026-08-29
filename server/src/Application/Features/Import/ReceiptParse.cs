using System.Globalization;
using System.Text.Json;
using System.Text.Json.Serialization;

namespace Shifter.Application.Features.Import;

/// <summary>What a receipt was read as. Every field optional, on purpose.</summary>
public sealed class ParsedReceiptDto
{
    [JsonPropertyName("amount")] public string? Amount { get; set; }
    [JsonPropertyName("date")] public string? Date { get; set; }
    [JsonPropertyName("merchant")] public string? Merchant { get; set; }
    [JsonPropertyName("currency")] public string? Currency { get; set; }
}

/// <summary>
/// A photographed receipt turned into the beginnings of an expense.
///
/// An expense gets recorded when somebody remembers it, and two days later
/// nobody does. The receipt is in a pocket exactly when it is worth asking
/// about, which is the whole of why this exists.
///
/// Every field comes back nullable and the form stays editable whatever
/// happens. Receipts are creased, faded, photographed at an angle in bad light,
/// and a reader that fails by clearing the form is worse than no reader — the
/// person came here to record a number and now has to start again.
/// </summary>
public static class ReceiptParse
{
    public sealed record Read(decimal? Amount, DateOnly? Date, string? Merchant, string? Currency);

    /// <summary>Longer than any shop name and short enough not to be an address.</summary>
    public const int MerchantMax = 60;

    public static Read FromModelText(string text, DateOnly today)
    {
        var open = text.IndexOf('{');

        if (open < 0) return new Read(null, null, null, null);

        var depth = 0;
        var close = -1;

        for (var index = open; index < text.Length; index += 1)
        {
            if (text[index] == '{') depth += 1;
            if (text[index] == '}' && --depth == 0)
            {
                close = index;
                break;
            }
        }

        if (close < 0) return new Read(null, null, null, null);

        ParsedReceiptDto? parsed;

        try
        {
            parsed = JsonSerializer.Deserialize<ParsedReceiptDto>(text[open..(close + 1)]);
        }
        catch (JsonException)
        {
            return new Read(null, null, null, null);
        }

        if (parsed is null) return new Read(null, null, null, null);

        return new Read(
            Amount(parsed.Amount),
            Date(parsed.Date, today),
            Merchant(parsed.Merchant),
            Currency(parsed.Currency));
    }

    private static decimal? Amount(string? value)
    {
        if (value is null) return null;

        // The minus is kept so a negative can be recognised and rejected.
        // Stripping it turns a refund line into a purchase, which is a wrong
        // number that looks entirely reasonable.
        var digits = new string(value
            .Where(letter => char.IsDigit(letter) || letter is '.' or ',' or '-')
            .ToArray())
            .Replace(',', '.');

        if (digits.Count(letter => letter == '.') > 1) return null;
        if (digits.LastIndexOf('-') > 0) return null;

        if (!decimal.TryParse(digits, NumberStyles.Number, CultureInfo.InvariantCulture, out var amount))
            return null;

        // Zero is not a receipt, and a million-hryvnia coffee is a decimal
        // point the model put in the wrong place. Both go back as nothing,
        // which leaves the field for the person rather than filling it wrong.
        return amount is > 0m and < 1_000_000m ? Math.Round(amount, 2) : null;
    }

    private static DateOnly? Date(string? value, DateOnly today)
    {
        if (value is null) return null;
        if (!DateOnly.TryParseExact(value, "yyyy-MM-dd", out var date)) return null;

        // A receipt from the future is a misread year, and one from before
        // this trade had card terminals is a misread everything. Neither is
        // worth putting in front of somebody as a fact.
        return date <= today.AddDays(1) && date >= today.AddYears(-5) ? date : null;
    }

    private static string? Merchant(string? value)
    {
        var name = (value ?? string.Empty).Trim();

        if (name.Length == 0) return null;

        return name.Length > MerchantMax ? name[..MerchantMax] : name;
    }

    /// <summary>
    /// Three letters or nothing. A currency the app cannot name is better
    /// left to the form's own default than guessed at from a symbol.
    /// </summary>
    private static string? Currency(string? value)
    {
        var code = (value ?? string.Empty).Trim().ToUpperInvariant();

        return code.Length == 3 && code.All(char.IsAsciiLetterUpper) ? code : null;
    }

    /// <summary>The instruction the photograph travels with.</summary>
    public const string Prompt =
        """
        This image is a shop or restaurant receipt. Read it and reply with one
        JSON object and nothing else — no prose, no code fence.

        {"amount": "the grand total as digits, e.g. 342.50",
         "date": "YYYY-MM-DD, the date printed on the receipt",
         "merchant": "the shop or venue name as printed",
         "currency": "the three-letter code, e.g. UAH"}

        Rules:
        - The total is the final amount paid, after discounts. Not the subtotal,
          not the VAT line, not the cash tendered, not the change.
        - Use null for any field the receipt does not show or you cannot read.
          A guess is worse than a null here: the person will be shown these
          values and may not check them.
        - Never invent a date. If only a day and month are visible, use null.
        """;
}
