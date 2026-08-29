using System.Text.RegularExpressions;

using Xunit;

namespace Shifter.Tests;

/// <summary>
/// A weekly or monthly wage earns nothing per shift — it belongs to the
/// period — so <see cref="Shifter.Domain.Entities.DayShift.Pay"/> is zero for
/// everybody on a salary. Any code that sums it and calls the result somebody's
/// income silently reports a year of tips and nothing else, for exactly the
/// people most likely to be reading.
///
/// It has happened twice: once in the tax profile and once in the monthly
/// letter, both written the same evening, both by the same reasoning. This
/// pins it, because the mistake is invisible in a test written by whoever made
/// it — the fixture would have hourly shifts in it.
/// </summary>
public class SalaryIsNotForgottenTests
{
    private static string Root()
    {
        var here = new DirectoryInfo(AppContext.BaseDirectory);

        while (here is not null && !Directory.Exists(Path.Combine(here.FullName, "server")))
            here = here.Parent;

        Assert.NotNull(here);

        return here!.FullName;
    }

    /// <summary>
    /// Files that sum shift pay and are known to handle the period wage
    /// separately, each read before being listed. Adding a name here is a
    /// claim that somebody checked.
    /// </summary>
    private static readonly Dictionary<string, string> Handled = new()
    {
        ["DayHandler.cs"] = "adds PeriodSalary alongside, which is where the rule lives",
        ["MonthlyLetterService.cs"] = "EarnedOn is per-shift on purpose; Earned adds PeriodSalary",
        ["TaxService.cs"] = "adds PeriodSalary over a window wide enough for a straddling week",
        ["ReconciliationService.cs"] = "reconciles against the handler's own figures",
        // Not a figure anybody is shown as their income: it is one line of a
        // per-day change log, and a day's share of a monthly wage is not a
        // per-day fact — it moves every time another day in the month is
        // worked. Whether the log should carry a share at all is a separate
        // question from this one, and it predates this guard.
        ["DayAuditWriter.cs"] = "a per-day change log, not an income figure",
    };

    [Fact]
    public void Nothing_calls_a_sum_of_shift_pay_somebody_income()
    {
        var offenders = new List<string>();

        foreach (var file in Directory.GetFiles(
            Path.Combine(Root(), "server", "src"), "*.cs", SearchOption.AllDirectories))
        {
            var name = Path.GetFileName(file);

            if (Handled.ContainsKey(name)) continue;

            var source = File.ReadAllText(file);

            // Sum(entry => entry.Pay) and its close relatives, in any spelling
            // of the lambda's parameter.
            if (Regex.IsMatch(source, @"Sum\(\s*\w+\s*=>\s*\w+\.Pay\b"))
                offenders.Add($"{name} sums DayShift.Pay without adding the period wage");
        }

        Assert.Empty(offenders);
    }

    [Fact]
    public void The_rule_still_lives_where_this_test_says_it_does()
    {
        // A guard whose escape list points at a file that no longer contains
        // the rule is a guard that has quietly stopped guarding.
        var handler = File.ReadAllText(Path.Combine(
            Root(), "server", "src", "Application", "Features", "business", "Services", "DayHandler.cs"));

        Assert.Contains("public static decimal PeriodSalary(", handler);
    }
}
