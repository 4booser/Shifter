using System.Text.RegularExpressions;

using Xunit;

namespace Shifter.Tests;

/// <summary>
/// A migration that adds a non-nullable column has to say what the rows
/// already in the table hold. EF offers the type's zero — "" for text, 0 for
/// an int, 0001-01-01 for a date — and that is almost never a value the
/// application will accept back.
///
/// It has happened three times in this project. An empty colour went into a
/// style attribute and painted a workplace as nothing; a pay day of 0 sat
/// outside the 1..28 the form allows, so the place could not be saved again;
/// an anchor of 0001-01-01 made a fortnightly cycle count two thousand years
/// of fortnights to reach this one. Each was repaired later, and only for its
/// own columns.
///
/// So the rule is checked rather than remembered. Where a zero really is the
/// answer, the column says so here — and saying so is a sentence somebody has
/// to write on purpose.
/// </summary>
public class MigrationDefaultsTests
{
    /// <summary>
    /// Columns where the type's zero is the intended meaning. Each is a
    /// decision, not an oversight, and the note says which.
    /// </summary>
    private static readonly Dictionary<string, string> Deliberate = new()
    {
        ["Currency"] = "empty means \"whatever the app is set to\"",
        ["HolidayCountry"] = "empty means no holiday calendar, so no holiday premium",
        ["Address"] = "a place need not have one",
        ["Note"] = "most days have nothing to say",
        ["Symbol"] = "a badge is optional",
        ["Details"] = "a listing need not elaborate",
        ["Schedule"] = "only permanent roles have a rhythm to state",
        ["PhotosJson"] = "an empty array is an empty array",
        ["ShareSlug"] = "filled by the migration that adds it, per row",
        ["Message"] = "a reply need not carry words",
        ["MealDeduction"] = "nothing withheld for food is the ordinary case",
        ["MinimumHourly"] = "zero is off — nobody has named a floor",
        ["EarnedAtWriting"] = "an amount, and nothing recorded is nothing",

        // Enums whose zero is the value the entity itself defaults to. Each
        // was read before being listed here; the note says which one it is.
        ["SalaryPeriod"] = "0 is Hour",
        ["PayPeriod"] = "0 is Monthly",
        ["Employment"] = "0 is Freelance",
        ["Kind"] = "0 is Ordinary",
        ["TipSource"] = "0 is Personal",
        ["Role"] = "0 is Unset — \"not said\", counted apart rather than guessed",

        // Amounts and rates where nothing is the ordinary answer.
        ["TipOutOfTipsPercent"] = "most places take no cut of tips",
        ["TipOutOfSalesPercent"] = "most places take no cut of sales",
        ["TaxPercent"] = "nothing withheld at source is the ordinary case here",
        ["HolidayPercent"] = "nothing accrued unless the place says so",
        ["AutoBreakAfterHours"] = "zero is off — no break applies itself",
        ["AutoBreakMinutes"] = "zero is off, with the line above",
        ["CommuteMinutes"] = "zero reads as \"nobody has said\" everywhere it is used",
        ["CommuteCost"] = "zero reads as \"nobody has said\", with the line above",
        ["Cost"] = "an event recorded before the field existed cost nothing recorded",
        ["TipSavePercent"] = "zero is off — nobody has asked to put a share aside",
        ["TipSaveGoal"] = "zero is no target, only a running total",
        ["Amount"] = "an amount, and nothing recorded is nothing",
        ["DayOfMonth"] = "set by the handler on every write; never left at the default",
        ["Weekday"] = "Monday, and only read when the rhythm is weekly",
        ["Zone"] = "0 is Unset — \"nobody said\", counted apart rather than guessed",
    };

    /// <summary>
    /// The ones that already shipped. A migration cannot be edited once it has
    /// run somewhere, so each is listed with the repair that put it right —
    /// which is the point of writing them down rather than deleting the check.
    /// </summary>
    private static readonly Dictionary<string, string> AlreadyRepaired = new()
    {
        ["20260815122446_LocationsAndPayPeriods.cs: Colour"] = "RepairLegacyPlaces",
        ["20260815122446_LocationsAndPayPeriods.cs: PayDay"] = "RepairLegacyPlaces",
        ["20260815122446_LocationsAndPayPeriods.cs: PayAnchor"] = "RepairLegacyPlaces",
        ["20260815123849_Overtime.cs: OvertimeMultiplier"] = "RepairLegacyPlaces — this one paid negative overtime",
        ["20260822150428_TeamVisibility.cs: Colour"] = "RepairLegacyPlaces",
        ["20260827093132_NightAndHolidayPremiums.cs: NightMultiplier"] = "RepairLegacyPlaces",
        ["20260827093132_NightAndHolidayPremiums.cs: PublicHolidayMultiplier"] = "RepairLegacyPlaces",
        ["20260815123849_Overtime.cs: OvertimeWeeklyHours"] = "RepairLegacyPlaces — zero made every hour overtime",
    };

    private static string MigrationsDirectory()
    {
        var directory = new DirectoryInfo(AppContext.BaseDirectory);

        while (directory is not null && !File.Exists(Path.Combine(directory.FullName, "Shifter.sln")))
            directory = directory.Parent;

        Assert.NotNull(directory);

        return Path.Combine(directory!.FullName, "server/src/Infrastructure/Persistence/Migrations");
    }

    [Fact]
    public void No_migration_adds_a_column_whose_default_the_app_would_reject()
    {
        var offenders = new List<string>();

        foreach (var file in Directory.GetFiles(MigrationsDirectory(), "*.cs"))
        {
            if (file.EndsWith(".Designer.cs") || file.EndsWith("Snapshot.cs")) continue;

            var source = File.ReadAllText(file);

            // AddColumn<T>( name: "X", table: "Y", … defaultValue: Z )
            foreach (Match call in Regex.Matches(
                source,
                @"AddColumn<[^>]+>\((?<body>[^;]*?)\);",
                RegexOptions.Singleline))
            {
                var body = call.Groups["body"].Value;
                var name = Regex.Match(body, @"name:\s*""(?<n>[^""]+)""").Groups["n"].Value;
                var value = Regex.Match(body, @"defaultValue:\s*(?<v>[^,\)]+)").Groups["v"].Value.Trim();

                if (name.Length == 0 || value.Length == 0) continue;
                if (Deliberate.ContainsKey(name)) continue;

                var zero = value is "\"\"" or "0" or "0m" or "0.0m"
                    || value.Contains("new DateOnly(1, 1, 1)")
                    || value.Contains("new DateTime(1, 1, 1");

                // No suffix rule. "…Hours" was allowed as a quantity, where
                // zero is honest — and then RestHours arrived, which is a
                // threshold, where zero is not an answer anybody gave. A name
                // cannot tell those apart; only somebody who read the column
                // can, and writing it down below is how they say so.
                if (!zero) continue;

                var where = $"{Path.GetFileName(file)}: {name}";

                if (AlreadyRepaired.ContainsKey(where)) continue;

                offenders.Add($"{where} = {value}");
            }
        }

        Assert.Empty(offenders);
    }

    /// <summary>
    /// The repair itself has to exist, and has to still touch every column
    /// the list above says it does — otherwise this file becomes a way to
    /// silence the check by naming a migration that no longer mentions it.
    /// </summary>
    [Fact]
    public void Every_repair_named_here_actually_repairs_what_it_claims()
    {
        var repairs = Directory
            .GetFiles(MigrationsDirectory(), "*RepairLegacyPlaces.cs")
            .Where(file => !file.EndsWith(".Designer.cs"))
            .Select(File.ReadAllText)
            .ToArray();

        Assert.NotEmpty(repairs);

        var text = string.Join("\n", repairs);

        foreach (var column in AlreadyRepaired.Keys.Select(key => key.Split(": ")[1]).Distinct())
            Assert.Contains($"\"{column}\"", text);
    }
}
