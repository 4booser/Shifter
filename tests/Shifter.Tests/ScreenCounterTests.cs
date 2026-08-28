using System.Reflection;

using Shifter.Domain.Entities;

using Xunit;

namespace Shifter.Tests;

/// <summary>
/// Decisions about what to build have been made by guessing, because nobody
/// knows which screens people use. The usual answer is an analytics SDK —
/// somebody else's code, watching everything, reporting to a third party — in
/// an application whose whole argument is that it does not do that.
///
/// So the counter is one integer per screen per day, and this test is the
/// promise: there is no identifier on it, and there is no way to add one
/// without deleting this.
/// </summary>
public class ScreenCounterTests
{
    private static readonly string[] Identifying =
        ["user", "session", "device", "token", "ip", "address", "email", "login", "account"];

    [Fact]
    public void The_counter_carries_nothing_that_could_name_anybody()
    {
        var offenders = typeof(ScreenOpen)
            .GetProperties(BindingFlags.Public | BindingFlags.Instance)
            .Select(property => property.Name)
            .Where(name => Identifying.Any(word =>
                name.Contains(word, StringComparison.OrdinalIgnoreCase)))
            .ToArray();

        Assert.Empty(offenders);
    }

    [Fact]
    public void It_carries_a_day_a_screen_and_a_number_and_nothing_else()
    {
        // Pinned rather than merely checked for identifiers: a timestamp to
        // the second, or a country, or a version string, is not an identifier
        // on its own and is exactly how one gets assembled later.
        Assert.Equal(
            ["Count", "Day", "Id", "Screen"],
            typeof(ScreenOpen)
                .GetProperties(BindingFlags.Public | BindingFlags.Instance)
                .Select(property => property.Name)
                .OrderBy(name => name)
                .ToArray());
    }

    [Fact]
    public void A_screen_name_is_short_enough_not_to_be_a_hiding_place()
    {
        // Forty characters holds "calendar". It does not hold anything
        // somebody might smuggle through a name field.
        Assert.True(ScreenOpen.NameMax <= 40);
    }
}
