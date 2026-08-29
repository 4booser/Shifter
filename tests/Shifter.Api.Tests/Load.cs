using System.Diagnostics;
using System.Net.Http.Json;
using System.Text.Json;

using Xunit;

namespace Shifter.Api.Tests;

/// <summary>
/// A few years of somebody's working life, and a stopwatch.
///
/// Nobody has ever measured this application against an amount of data a real
/// person accumulates. Everything anybody has looked at was a fresh account
/// with a handful of days in it, where a query that fans out per day and a
/// query that does not are indistinguishable.
///
/// Three years is not an extreme case. It is a bartender who has had the app
/// since it launched, which is exactly who matters most: the person with the
/// most in it is the person least able to leave.
/// </summary>
public static class Load
{
    /// <summary>Shifts a week, which is what this trade actually works.</summary>
    private const int ShiftsPerWeek = 5;

    public sealed record Seeded(int Place, int[] Shifts, int Days);

    /// <summary>
    /// Writes a working life through the real API.
    ///
    /// Through the API rather than straight into the tables, so what is
    /// measured afterwards is measured against rows the application itself
    /// produced — including every default and every derived figure it fills
    /// in, which is where a surprise would hide.
    /// </summary>
    public static async Task<Seeded> SeedAsync(HttpClient client, DateOnly from, DateOnly to)
    {
        var place = await CreatePlaceAsync(client);

        int[] shifts =
        [
            await CreateShiftAsync(client, "День", place, 180m, "10:00", "18:00"),
            await CreateShiftAsync(client, "Вечер", place, 220m, "16:00", "00:00"),
            await CreateShiftAsync(client, "Закрытие", place, 260m, "18:00", "02:00"),
        ];

        var written = 0;
        var day = from;

        while (day <= to)
        {
            // Five days in seven, which is a rota rather than a pattern that
            // happens to make the arithmetic tidy.
            if ((int)day.DayOfWeek is not (0 or 3))
            {
                var shift = shifts[written % shifts.Length];

                var response = await client.PutAsJsonAsync(
                    $"/shifter/v1/days/{day:yyyy-MM-dd}",
                    new
                    {
                        shifts = new[]
                        {
                            new
                            {
                                shift_id = shift,
                                worked = true,
                                needs_cover = false,
                                actual_start = (string?)null,
                                actual_end = (string?)null,
                                break_minutes = (int?)null,
                                revenue = (decimal?)(written % 4 == 0 ? 18_400m : null),
                            },
                        },
                        sales = Array.Empty<object>(),
                        tips = 400m + written % 600,
                        tips_cash = 200m,
                        deductions = written % 40 == 0 ? 150m : 0m,
                        deduction_reason = written % 40 == 0 ? "breakage" : null,
                        note = written % 12 == 0 ? "полный зал, две брони" : null,
                    });

                response.EnsureSuccessStatusCode();

                written += 1;
            }

            day = day.AddDays(1);
        }

        // A payout a month, because a reconciliation reads them and a range
        // with none in it is not the range anybody looks at.
        var month = new DateOnly(from.Year, from.Month, 1);

        while (month < to)
        {
            var end = month.AddMonths(1).AddDays(-1);

            (await client.PostAsJsonAsync("/shifter/v1/payouts", new
            {
                location_id = place,
                period_from = month.ToString("yyyy-MM-dd"),
                period_to = end.ToString("yyyy-MM-dd"),
                amount = 24_000m,
                received_on = end.ToString("yyyy-MM-dd"),
                note = (string?)null,
            })).EnsureSuccessStatusCode();

            month = month.AddMonths(1);
        }

        return new Seeded(place, shifts, written);
    }

    private static async Task<int> CreatePlaceAsync(HttpClient client)
    {
        var made = await client.PostAsJsonAsync("/shifter/v1/locations", new
        {
            name = "Бар на углу",
            address = (string?)null,
            colour = "#1F3A5F",
            pay_period = "monthly",
            pay_day = 10,
            pay_anchor = (DateOnly?)null,
            overtime_weekly_hours = 40d,
            overtime_multiplier = 1.5m,
            night_multiplier = 1.2m,
            night_from = "22:00",
            night_to = "06:00",
            public_holiday_multiplier = 2m,
            holiday_country = "UA",
            tip_out_of_tips_percent = 5m,
            tip_out_of_sales_percent = 0m,
            meal_deduction = 80m,
            tax_percent = 5m,
            tax_tips = false,
            holiday_percent = 8m,
            currency = (string?)null,
        });

        made.EnsureSuccessStatusCode();

        return (await made.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("id").GetInt32();
    }

    private static async Task<int> CreateShiftAsync(
        HttpClient client, string name, int place, decimal hourly, string start, string end)
    {
        var made = await client.PostAsJsonAsync("/shifter/v1/shifts", new
        {
            name,
            symbol = (string?)null,
            location_id = place,
            start_time = start,
            end_time = end,
            salary_period = "hour",
            salary_amount = hourly,
            break_minutes = 30,
        });

        made.EnsureSuccessStatusCode();

        return (await made.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("id").GetInt32();
    }

    /// <summary>The best of a few runs, so a cold cache does not become the finding.</summary>
    public static async Task<long> TimeAsync(HttpClient client, string path, int runs = 3)
    {
        var best = long.MaxValue;

        for (var run = 0; run < runs; run += 1)
        {
            var clock = Stopwatch.StartNew();
            var response = await client.GetAsync(path);

            clock.Stop();

            Assert.True(
                response.IsSuccessStatusCode,
                $"{(int)response.StatusCode} {path}: {await response.Content.ReadAsStringAsync()}");

            best = Math.Min(best, clock.ElapsedMilliseconds);
        }

        return best;
    }
}
