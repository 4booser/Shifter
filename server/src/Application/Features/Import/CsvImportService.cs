using Microsoft.EntityFrameworkCore;

using Shifter.Application.Common.Exceptions;
using Shifter.Domain.Entities;
using Shifter.Infrastructure.Persistence.DbContexts;

namespace Shifter.Application.Features.Import;

/// <summary>
/// A year of somebody's records, carried in from whatever they used before.
///
/// Nobody retypes a year. The alternative to importing badly is not importing
/// carefully — it is the person deciding this app starts empty and theirs does
/// not, and leaving.
///
/// Two steps, and the first one writes nothing. A file is read into a grid,
/// the columns are guessed, and the whole thing goes back to a preview screen
/// where a person fixes the guess. Only then is anything saved. A confident
/// import that put tips in the wage column would be indistinguishable from a
/// correct one a month later.
/// </summary>
public sealed class CsvImportService
{
    private readonly ShifterDbContext _db;

    public CsvImportService(ShifterDbContext db) => _db = db;

    /// <summary>Rows shown before anybody commits to anything.</summary>
    public const int PreviewRows = 20;

    public sealed record Cell(string Date, string Hours, string Earned, string Tips, string Place, string Note);

    public sealed record Preview(
        string[] Header,
        Dictionary<string, int> Mapping,
        Cell[] Rows,
        int TotalRows,
        /// <summary>Rows that would be skipped, and why. Said before, not after.</summary>
        string[] Problems);

    public Preview Read(string text)
    {
        var rows = Csv.Parse(text);

        if (rows.Count < 2)
            throw new ValidationException("The file needs a header row and at least one row of data.");

        var header = rows[0];
        var mapping = CsvGuess.Map(header);
        var body = rows.Skip(1).ToArray();

        List<string> problems = [];

        if (mapping["date"] < 0)
            problems.Add("no-date-column");

        // Counted over the whole file rather than the twenty rows shown, so
        // "42 rows will be skipped" is the truth and not a sample of it.
        var undated = mapping["date"] < 0
            ? body.Length
            : body.Count(row => CsvGuess.Date(At(row, mapping["date"])) is null);

        if (undated > 0) problems.Add($"undated:{undated}");

        return new Preview(
            header,
            mapping,
            body.Take(PreviewRows).Select(row => new Cell(
                At(row, mapping["date"]),
                At(row, mapping["hours"]),
                At(row, mapping["earned"]),
                At(row, mapping["tips"]),
                At(row, mapping["place"]),
                At(row, mapping["note"]))).ToArray(),
            body.Length,
            [.. problems]);
    }

    public sealed record Written(int Days, int Skipped, int Places);

    /// <summary>
    /// Writes the file, under the mapping a person confirmed.
    ///
    /// Days that already have something on them are left alone. Somebody
    /// importing a year on top of three months of real work must not lose the
    /// three months, and "the past is not rewritten" does not stop being true
    /// because the rewrite came from a spreadsheet.
    /// </summary>
    public async Task<Written> ApplyAsync(
        int userId,
        string text,
        Dictionary<string, int> mapping,
        TimeOnly start,
        CancellationToken ct)
    {
        var rows = Csv.Parse(text);

        if (rows.Count < 2) throw new ValidationException("Nothing to import.");
        if (!mapping.TryGetValue("date", out var dateAt) || dateAt < 0)
            throw new ValidationException("Say which column holds the date.");

        var body = rows.Skip(1).ToArray();

        var existing = await _db.Days
            .AsNoTracking()
            .Where(day => day.UserId == userId)
            .Select(day => day.Date)
            .ToListAsync(ct);

        var taken = existing.ToHashSet();

        // Grouped rather than keyed directly: two templates called "Бар" and
        // "бар" are an ordinary thing to have, and a dictionary would throw on
        // the second one and take the whole import with it.
        var templates = (await _db.Shifts
                .Where(shift => shift.UserId == userId)
                .ToArrayAsync(ct))
            .GroupBy(shift => shift.Name.ToLowerInvariant())
            .ToDictionary(group => group.Key, group => group.First());

        var made = 0;
        var skipped = 0;
        var placesMade = 0;

        foreach (var row in body)
        {
            if (CsvGuess.Date(At(row, dateAt)) is not { } date) { skipped += 1; continue; }
            if (!taken.Add(date)) { skipped += 1; continue; }

            var hours = CsvGuess.Number(At(row, Get(mapping, "hours"))) ?? 0m;
            var earned = CsvGuess.Number(At(row, Get(mapping, "earned")));
            var tips = CsvGuess.Number(At(row, Get(mapping, "tips")));
            var place = At(row, Get(mapping, "place"));
            var note = At(row, Get(mapping, "note"));

            var name = place.Length > 0 ? place : "Импорт";
            var key = name.ToLowerInvariant();

            if (!templates.TryGetValue(key, out var template))
            {
                template = new Shift
                {
                    UserId = userId,
                    Name = name.Length > 60 ? name[..60] : name,
                    // Paid by the day, with the day's own figure. An hourly
                    // rate worked back from wage ÷ hours would be a rate this
                    // person never agreed to, printed on every future shift.
                    SalaryPeriod = SalaryPeriod.Day,
                    SalaryAmount = 0m,
                    StartTime = start,
                    EndTime = start,
                };

                _db.Shifts.Add(template);
                templates[key] = template;
                placesMade += 1;

                // Saved per new template rather than at the end, because the
                // placement below needs an identifier and two rows naming the
                // same new venue must find the same one.
                await _db.SaveChangesAsync(ct);
            }

            var span = hours > 0m ? (double)hours : 0;
            var end = start.AddHours(span);

            _db.Days.Add(new Day
            {
                UserId = userId,
                Date = date,
                Tips = tips,
                Note = note.Length > 0 ? note : null,
                Shifts =
                [
                    new DayShift
                    {
                        ShiftId = template.Id,
                        Worked = true,
                        SalaryPeriod = SalaryPeriod.Day,
                        // The file's own figure, not a rate multiplied back
                        // out. Whatever the other app paid, this day paid.
                        SalaryAmount = earned ?? 0m,
                        StartTime = start,
                        EndTime = end,
                    },
                ],
            });

            made += 1;

            // Batched, or a year of days is a year of round trips.
            if (made % 200 == 0) await _db.SaveChangesAsync(ct);
        }

        await _db.SaveChangesAsync(ct);

        return new Written(made, skipped, placesMade);
    }

    private static int Get(Dictionary<string, int> mapping, string field)
        => mapping.TryGetValue(field, out var index) ? index : -1;

    private static string At(string[] row, int index)
        => index >= 0 && index < row.Length ? row[index] : string.Empty;
}
