using System.Globalization;

namespace Shifter.Application.Features.Import;

/// <summary>
/// Which column is which, guessed and then shown to a person for correction.
///
/// The guess is a convenience and never an authority. Every mapping this
/// produces lands on a preview screen where somebody can change it, because
/// the failure mode of a confident guess here is a year of somebody's records
/// written into the wrong fields — tips filed as wages, and no way to tell
/// afterwards which is which.
/// </summary>
public static class CsvGuess
{
    /// <summary>The things a row can be understood as. Everything else is ignored.</summary>
    public static readonly string[] Fields =
        ["date", "hours", "earned", "tips", "place", "note"];

    private static readonly Dictionary<string, string[]> Words = new()
    {
        ["date"] = ["дата", "день", "date", "day", "число"],
        ["hours"] = ["час", "hours", "hrs", "часы", "години", "продолжит"],
        ["earned"] = ["зарплат", "заработ", "оплат", "earned", "pay", "wage", "ставка", "сумма", "amount", "salary"],
        ["tips"] = ["чаев", "чайов", "tips", "tip", "типы"],
        ["place"] = ["мест", "заведен", "place", "venue", "location", "работа", "job", "бар", "точка"],
        ["note"] = ["замет", "коммент", "note", "comment", "примеч"],
    };

    /// <summary>
    /// A column index per field, or −1 where nothing looked like it.
    ///
    /// One column can only be one thing: a header called "сумма чаевых"
    /// matches both money words, and letting it be both would silently double
    /// somebody's month.
    /// </summary>
    public static Dictionary<string, int> Map(string[] header)
    {
        var lowered = header.Select(name => name.Trim().ToLowerInvariant()).ToArray();
        var taken = new HashSet<int>();

        Dictionary<string, int> map = [];

        // Tips before wages on purpose: "сумма чаевых" contains both "сумма"
        // and "чаев", and of the two readings only one is ever right.
        foreach (var field in new[] { "date", "tips", "hours", "earned", "place", "note" })
        {
            var found = -1;

            for (var index = 0; index < lowered.Length; index += 1)
            {
                if (taken.Contains(index)) continue;
                if (!Words[field].Any(word => lowered[index].Contains(word))) continue;

                found = index;
                break;
            }

            if (found >= 0) taken.Add(found);

            map[field] = found;
        }

        return map;
    }

    /// <summary>
    /// A date in whatever the other app wrote.
    ///
    /// Day-first before month-first, because everywhere this app is used
    /// writes 03.04 meaning the third of April, and an American reading of the
    /// same file moves a whole year of shifts by up to eleven months without
    /// producing a single obviously wrong row.
    /// </summary>
    public static DateOnly? Date(string value)
    {
        var text = value.Trim();

        if (text.Length == 0) return null;

        string[] formats =
        [
            "yyyy-MM-dd", "dd.MM.yyyy", "dd.MM.yy", "dd/MM/yyyy", "dd/MM/yy",
            "d.M.yyyy", "d/M/yyyy", "dd-MM-yyyy", "yyyy/MM/dd", "dd MMM yyyy",
        ];

        foreach (var format in formats)
        {
            if (DateOnly.TryParseExact(text, format, CultureInfo.InvariantCulture,
                    DateTimeStyles.None, out var parsed))
                return parsed;
        }

        return null;
    }

    /// <summary>
    /// A number in whatever the other app wrote: spaces inside it, a comma for
    /// the decimal point, a currency symbol stuck to the end.
    ///
    /// Null rather than zero for anything unreadable. A row whose wage could
    /// not be read is a row to show somebody, not a day that earned nothing.
    /// </summary>
    public static decimal? Number(string value)
    {
        var text = new string(value
            .Where(letter => char.IsDigit(letter) || letter is '.' or ',' or '-')
            .ToArray())
            .Replace(',', '.');

        // A stray minus in the middle of a currency string is not a negative
        // number, and "1.234.56" is a thousands separator somebody's export
        // wrote; neither is worth guessing at.
        if (text.Count(letter => letter == '.') > 1) return null;
        if (text.LastIndexOf('-') > 0) return null;

        return decimal.TryParse(text, NumberStyles.Number, CultureInfo.InvariantCulture, out var parsed)
            ? parsed
            : null;
    }
}
