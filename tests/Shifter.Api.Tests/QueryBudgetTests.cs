using System.Net.Http.Json;

using Shifter.Api.Middlewares;

using Xunit;

namespace Shifter.Api.Tests;

/// <summary>
/// The SQL counter, and the budgets it exists to hold.
///
/// The first assertion is on the instrument itself: a counter that reports
/// zero for a request that certainly queried is broken, and the previous one
/// was thrown away for exactly that. Only after the counter proves it counts
/// do the budgets mean anything.
///
/// The budgets are next to the point, not the point: a month view that is
/// fast beside its own database can be a hundred round trips over a real
/// network, and milliseconds hide what a count shows.
/// </summary>
[Collection("api")]
public sealed class QueryBudgetTests(Api api)
{
    /// <summary>Asks the middleware to measure one request, returns the count.</summary>
    private static async Task<int> CountAsync(HttpClient client, string url)
    {
        using var request = new HttpRequestMessage(HttpMethod.Get, url);

        request.Headers.Add(QueryCountMiddleware.Ask, "1");

        var response = await client.SendAsync(request);

        response.EnsureSuccessStatusCode();

        return int.Parse(response.Headers.GetValues(QueryCountMiddleware.Answer).Single());
    }

    [Fact]
    public async Task The_counter_counts_itself_before_counting_anything_else()
    {
        var (client, _) = await api.SignInAsync("counter");

        var counted = await CountAsync(client, "/shifter/v1/days?from=2026-06-01&to=2026-06-30");

        // Not a budget — an existence proof. Zero here means the interceptor
        // fell out of the options, and every budget below is vacuously green.
        Assert.True(counted > 0, "The query counter reported zero for a request that certainly queried.");
    }

    [Fact]
    public async Task A_month_view_stays_inside_its_query_budget()
    {
        var (client, _) = await api.SignInAsync("budget");

        var shift = await client.PostAsJsonAsync("/shifter/v1/shifts", new
        {
            name = "Смена",
            symbol = (string?)null,
            location_id = (int?)null,
            start_time = "10:00",
            end_time = "18:00",
            salary_period = "hour",
            salary_amount = 150m,
            break_minutes = 0,
        });

        shift.EnsureSuccessStatusCode();

        var shiftId = System.Text.Json.JsonDocument.Parse(
            await shift.Content.ReadAsStringAsync()).RootElement.GetProperty("id").GetInt32();

        // Twenty worked days: a busy month, not a toy one.
        for (var day = 1; day <= 20; day++)
        {
            (await client.PutAsJsonAsync($"/shifter/v1/days/2026-06-{day:00}", new
            {
                shifts = new[]
                {
                    new
                    {
                        shift_id = shiftId,
                        worked = true,
                        needs_cover = false,
                        actual_start = (string?)null,
                        actual_end = (string?)null,
                        break_minutes = (int?)null,
                        revenue = (decimal?)null,
                    },
                },
                sales = Array.Empty<object>(),
                tips = 200m,
                tips_cash = (decimal?)null,
                deductions = 0m,
                deduction_reason = (string?)null,
                note = (string?)null,
            })).EnsureSuccessStatusCode();
        }

        var month = await CountAsync(client, "/shifter/v1/days?from=2026-06-01&to=2026-06-30");
        var everything = await CountAsync(client, "/shifter/v1/days?from=2020-01-01&to=2029-12-31");

        // The budgets: a month view must not scale with the days in it, and
        // «всё время» must cost the same shape as a month. Both numbers are
        // deliberately loose — the failure this guards is O(days), which
        // lands in the hundreds, not at eleven.
        Assert.InRange(month, 1, 15);
        Assert.InRange(everything, 1, 15);
    }

    [Fact]
    public async Task The_heavy_pages_stay_inside_their_budgets_too()
    {
        var (client, login) = await api.SignInAsync("heavy");

        var place = await client.PostAsJsonAsync("/shifter/v1/locations", new
        {
            name = "Бар",
            address = (string?)null,
            colour = "#1F3A5F",
            pay_period = "monthly",
            pay_day = 10,
            pay_anchor = (DateOnly?)null,
            overtime_weekly_hours = 60d,
            overtime_multiplier = 1.5m,
            night_multiplier = 1m,
            night_from = "22:00",
            night_to = "06:00",
            public_holiday_multiplier = 1m,
            holiday_country = "",
            tip_out_of_tips_percent = 0m,
            tip_out_of_sales_percent = 0m,
            meal_deduction = 0m,
            tax_percent = 0m,
            tax_tips = false,
            holiday_percent = 0m,
            currency = (string?)null,
        });

        place.EnsureSuccessStatusCode();

        var placeId = System.Text.Json.JsonDocument.Parse(
            await place.Content.ReadAsStringAsync()).RootElement.GetProperty("id").GetInt32();

        var shift = await client.PostAsJsonAsync("/shifter/v1/shifts", new
        {
            name = "Смена",
            symbol = (string?)null,
            location_id = placeId,
            start_time = "10:00",
            end_time = "18:00",
            salary_period = "hour",
            salary_amount = 150m,
            break_minutes = 0,
        });

        shift.EnsureSuccessStatusCode();

        var shiftId = System.Text.Json.JsonDocument.Parse(
            await shift.Content.ReadAsStringAsync()).RootElement.GetProperty("id").GetInt32();

        for (var day = 1; day <= 20; day++)
        {
            (await client.PutAsJsonAsync($"/shifter/v1/days/2026-06-{day:00}", new
            {
                shifts = new[]
                {
                    new
                    {
                        shift_id = shiftId,
                        worked = true,
                        needs_cover = false,
                        actual_start = (string?)null,
                        actual_end = (string?)null,
                        break_minutes = (int?)null,
                        revenue = (decimal?)null,
                    },
                },
                sales = Array.Empty<object>(),
                tips = 200m,
                tips_cash = (decimal?)null,
                deductions = 0m,
                deduction_reason = (string?)null,
                note = (string?)null,
            })).EnsureSuccessStatusCode();
        }

        // A team with a rota to read.
        var team = await client.PostAsJsonAsync("/shifter/v1/teams", new { name = "Команда" });

        team.EnsureSuccessStatusCode();

        var teamId = System.Text.Json.JsonDocument.Parse(
            await team.Content.ReadAsStringAsync()).RootElement.GetProperty("id").GetInt32();

        var schedule = await CountAsync(client, "/shifter/v1/payouts/schedule?from=2026-06-01&to=2026-06-30");
        var history = await CountAsync(client, "/shifter/v1/history?money=true");
        var rota = await CountAsync(client, $"/shifter/v1/teams/{teamId}/rota?from=2026-06-01&to=2026-06-30");

        // Deliberately loose ceilings: the failure these hunt is O(days) or
        // O(members×days), which lands in the hundreds. A tightened budget
        // is a follow-up once the shape is guaranteed.
        Assert.InRange(schedule, 1, 25);
        Assert.InRange(history, 1, 15);
        Assert.InRange(rota, 1, 20);
    }
}

