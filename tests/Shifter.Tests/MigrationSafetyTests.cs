using System.Text.RegularExpressions;

using Xunit;

namespace Shifter.Tests;

/// <summary>
/// A deploy runs the migrations and then swaps the container, in that order.
/// For the length of that window — a minute, sometimes several — the release
/// that is still serving traffic is talking to the new schema.
///
/// So a migration that renames or drops anything is a migration that makes the
/// running application answer 500 to every request touching it, and there is
/// no way to arrange the deploy such that it does not. The fix is not in the
/// deploy: it is three releases instead of one.
///
///   1. Add the new column and write to both. Nothing is removed.
///   2. Release the code that reads the new one.
///   3. Remove the old column, once nothing is left that reads it.
///
/// This test is the rule. The seven that shipped before it are listed by name
/// so that the rule is enforced going forwards without pretending the past was
/// clean — every one of them took the site down for the length of a deploy,
/// which nobody noticed because nobody was looking.
/// </summary>
public class MigrationSafetyTests
{
    private static readonly string[] Narrowing =
        ["RenameColumn", "RenameTable", "DropColumn", "DropTable"];

    /// <summary>
    /// Already shipped, and unfixable now: a migration that has run somewhere
    /// cannot be edited. Listed rather than ignored so the count cannot creep.
    /// </summary>
    private static readonly HashSet<string> Shipped =
    [
        "20260815105837_SalaryPeriod.cs: RenameColumn SalaryPerWeek",
        "20260815105837_SalaryPeriod.cs: DropColumn SalaryPerDay",
        "20260815105837_SalaryPeriod.cs: DropColumn SalaryPerHour",
        "20260815105837_SalaryPeriod.cs: DropColumn SalaryPerMonth",
        "20260815121054_ExplicitDayShiftAndPayouts.cs: DropTable DayShift",
        "20260815122446_LocationsAndPayPeriods.cs: RenameTable Location",
        "20260827143456_GigListingCascade.cs: DropColumn OwnerId",
    ];

    private static string MigrationsDirectory()
    {
        var directory = new DirectoryInfo(AppContext.BaseDirectory);

        while (directory is not null && !File.Exists(Path.Combine(directory.FullName, "Shifter.sln")))
            directory = directory.Parent;

        Assert.NotNull(directory);

        return Path.Combine(directory!.FullName, "server/src/Infrastructure/Persistence/Migrations");
    }

    /// <summary>Only what runs on the way up. Down is a rollback, not a deploy.</summary>
    private static string UpOf(string source)
    {
        var start = source.IndexOf("protected override void Up", StringComparison.Ordinal);
        var end = source.IndexOf("protected override void Down", StringComparison.Ordinal);

        if (start < 0) return string.Empty;

        return end > start ? source[start..end] : source[start..];
    }

    [Fact]
    public void No_migration_takes_something_away_while_the_old_release_is_still_serving()
    {
        var offenders = new List<string>();

        foreach (var file in Directory.GetFiles(MigrationsDirectory(), "*.cs"))
        {
            if (file.EndsWith(".Designer.cs") || file.EndsWith("Snapshot.cs")) continue;

            var up = UpOf(File.ReadAllText(file));

            foreach (var operation in Narrowing)
            {
                foreach (Match match in Regex.Matches(up, operation + @"\(\s*name:\s*""(?<n>\w+)"""))
                {
                    var where = $"{Path.GetFileName(file)}: {operation} {match.Groups["n"].Value}";

                    if (Shipped.Contains(where)) continue;

                    offenders.Add(where);
                }
            }
        }

        Assert.Empty(offenders);
    }

    [Fact]
    public void The_list_of_shipped_offenders_does_not_outlive_the_migrations_on_it()
    {
        // A name left here after its migration was deleted would silence a
        // check nobody is making any more.
        var present = Directory
            .GetFiles(MigrationsDirectory(), "*.cs")
            .Select(Path.GetFileName)
            .ToHashSet();

        foreach (var entry in Shipped)
            Assert.Contains(entry.Split(':')[0], present);
    }
}
