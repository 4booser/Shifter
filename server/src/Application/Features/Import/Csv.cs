namespace Shifter.Application.Features.Import;

/// <summary>
/// A CSV reader that assumes as little as possible about the file.
///
/// Somebody with a year in another tracker will not retype it, and the export
/// they have is whatever that app produced: semicolons because the machine was
/// Russian-locale, a byte-order mark because it came out of Excel, quoted
/// fields with commas inside them because a venue is called "Bar, The".
///
/// Nothing here is written to the database. This turns bytes into a grid, and
/// a person on a preview screen decides what the grid means.
/// </summary>
public static class Csv
{
    public const int MaxRows = 5_000;
    public const int MaxColumns = 60;

    /// <summary>
    /// The separator this file actually uses.
    ///
    /// Guessed from the header line rather than assumed, because a comma in a
    /// semicolon file splits every venue name in half and the resulting grid
    /// looks plausible enough to import.
    /// </summary>
    public static char Delimiter(string text)
    {
        var line = text.Split('\n', 2)[0];

        // Counted outside quotes only: "Bar, The";"12" is a semicolon file
        // with a comma in it, and counting naively calls it a comma file.
        var counts = new Dictionary<char, int> { [','] = 0, [';'] = 0, ['\t'] = 0 };
        var quoted = false;

        foreach (var letter in line)
        {
            if (letter == '"') quoted = !quoted;
            else if (!quoted && counts.ContainsKey(letter)) counts[letter] += 1;
        }

        var best = counts.MaxBy(pair => pair.Value);

        // Nothing found means one column, and a comma is the least surprising
        // thing to tell the rest of the code.
        return best.Value == 0 ? ',' : best.Key;
    }

    /// <summary>
    /// The file as a grid of trimmed strings.
    ///
    /// Ragged rows are kept ragged rather than padded: a row with three cells
    /// where the header has six is a broken row, and the preview should be
    /// able to say so instead of showing four confident blanks.
    /// </summary>
    public static List<string[]> Parse(string text)
    {
        List<string[]> rows = [];

        if (string.IsNullOrWhiteSpace(text)) return rows;

        // Excel writes a byte-order mark and then the first header is called
        // "﻿Дата", which matches nothing.
        text = text.TrimStart('﻿');

        var delimiter = Delimiter(text);

        List<string> cells = [];
        var cell = new System.Text.StringBuilder();
        var quoted = false;

        for (var index = 0; index < text.Length; index += 1)
        {
            var letter = text[index];

            if (quoted)
            {
                if (letter != '"') { cell.Append(letter); continue; }

                // "" inside a quoted field is one quote, not the end of it.
                if (index + 1 < text.Length && text[index + 1] == '"')
                {
                    cell.Append('"');
                    index += 1;
                    continue;
                }

                quoted = false;
                continue;
            }

            if (letter == '"') { quoted = true; continue; }

            if (letter == delimiter)
            {
                cells.Add(cell.ToString().Trim());
                cell.Clear();
                continue;
            }

            if (letter is '\n' or '\r')
            {
                // \r\n is one break, and a file of empty rows is not a file of
                // rows: a trailing newline must not become a final blank row.
                if (letter == '\r' && index + 1 < text.Length && text[index + 1] == '\n') index += 1;

                cells.Add(cell.ToString().Trim());
                cell.Clear();

                if (cells.Any(value => value.Length > 0)) rows.Add([.. cells.Take(MaxColumns)]);

                cells.Clear();

                if (rows.Count >= MaxRows) return rows;

                continue;
            }

            cell.Append(letter);
        }

        cells.Add(cell.ToString().Trim());

        if (cells.Any(value => value.Length > 0)) rows.Add([.. cells.Take(MaxColumns)]);

        return rows;
    }
}
