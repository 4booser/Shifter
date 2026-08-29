using Xunit;


namespace Shifter.Api.Tests;

/// <summary>
/// How long the screens people actually open take, against three years of
/// somebody's working life.
///
/// The first run of this is a measurement rather than a check: nobody has ever
/// looked, so there is no number to be right or wrong about yet. What it
/// prints becomes the budget.
/// </summary>
[Collection("api")]
public sealed class LoadTests(Api api, ITestOutputHelper output)
{
    [Fact]
    public async Task How_long_the_hot_screens_take()
    {
        var (client, _) = await api.SignInAsync("load");

        var from = new DateOnly(2023, 9, 1);
        var to = new DateOnly(2026, 8, 31);

        var seeded = await Load.SeedAsync(client, from, to);

        output.WriteLine($"seeded {seeded.Days} worked days");

        var paths = new (string What, string Path)[]
        {
            ("a month on the calendar", "/shifter/v1/days?from=2026-08-01&to=2026-08-31"),
            ("a month, three years back", "/shifter/v1/days?from=2023-10-01&to=2023-10-31"),
            ("a year", "/shifter/v1/days?from=2026-01-01&to=2026-12-31"),
            ("everything, which the stats page asks for",
                "/shifter/v1/days?from=2000-01-01&to=2099-12-31"),
            ("the payouts page", "/shifter/v1/payouts"),
            ("the day's brief", "/shifter/v1/brief/blocks?date=2026-08-20"),
        };

        foreach (var (what, path) in paths)
        {
            var best = await Load.TimeAsync(client, path);

            output.WriteLine($"{best,6} ms  {what}");

            // A budget rather than a benchmark. It is not here to make the
            // application fast — it already is — but to notice the day
            // somebody adds a query inside a loop over the days, which is how
            // this kind of thing always arrives.
            Assert.True(
                best < 2_000,
                $"{what} took {best} ms over three years of days");
        }
    }
}
