using System.Net.Http.Json;
using System.Text.Json;

using Shifter.Application.Common.Time;

using Xunit;

namespace Shifter.Api.Tests;

/// <summary>
/// The census of holes: seed the gaps, read the map back.
/// </summary>
[Collection("api")]
public sealed class RecordsHealthOverHttpTests(Api api)
{
    private static async Task<JsonElement> Read(HttpResponseMessage response)
    {
        response.EnsureSuccessStatusCode();

        return JsonDocument.Parse(await response.Content.ReadAsStringAsync()).RootElement;
    }

    [Fact]
    public async Task Seeded_gaps_come_back_as_a_map_with_what_they_hurt()
    {
        var (client, _) = await api.SignInAsync("health");

        // A place without a city: invisible to the cities comparison.
        var place = await client.PostAsJsonAsync("/shifter/v1/locations", new
        {
            name = "Без города",
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

        var placeId = (await place.Content.ReadFromJsonAsync<JsonElement>())
            .GetProperty("id").GetInt32();

        // An hourly shift priced at zero: worked, counted, worth nothing.
        var shift = await client.PostAsJsonAsync("/shifter/v1/shifts", new
        {
            name = "Забыли ставку",
            symbol = (string?)null,
            location_id = placeId,
            start_time = "10:00",
            end_time = "18:00",
            salary_period = "hour",
            salary_amount = 0m,
            break_minutes = 0,
        });

        shift.EnsureSuccessStatusCode();

        var shiftId = (await shift.Content.ReadFromJsonAsync<JsonElement>())
            .GetProperty("id").GetInt32();

        // Worked two days ago, no tips said, no actual times.
        var day = new AppClock().Today.AddDays(-2).ToString("yyyy-MM-dd");

        (await client.PutAsJsonAsync($"/shifter/v1/days/{day}", new
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
            tips = (decimal?)null,
            tips_cash = (decimal?)null,
            deductions = 0m,
            deduction_reason = (string?)null,
            note = (string?)null,
        })).EnsureSuccessStatusCode();

        var gaps = (await Read(await client.GetAsync("/shifter/v1/health/records")))
            .EnumerateArray().ToArray();

        JsonElement Of(string kind) => gaps.Single(gap => gap.GetProperty("kind").GetString() == kind);

        Assert.Equal(1, Of("tips_unsaid").GetProperty("count").GetInt32());
        Assert.Equal(day, Of("tips_unsaid").GetProperty("sample")[0].GetString());
        Assert.Equal("weekday_tips", Of("tips_unsaid").GetProperty("hurts").GetString());

        Assert.Equal(1, Of("city_unsaid").GetProperty("count").GetInt32());
        Assert.Equal("Без города", Of("city_unsaid").GetProperty("sample")[0].GetString());

        Assert.Equal(1, Of("actual_times_unsaid").GetProperty("count").GetInt32());
        Assert.Equal(1, Of("rate_zero").GetProperty("count").GetInt32());

        // Fill a hole — the map shrinks. A list that shortens as you fill it
        // is the one progress bar that cannot lie.
        (await client.PutAsJsonAsync($"/shifter/v1/days/{day}", new
        {
            shifts = new[]
            {
                new
                {
                    shift_id = shiftId,
                    worked = true,
                    needs_cover = false,
                    actual_start = "10:05",
                    actual_end = "18:10",
                    break_minutes = (int?)null,
                    revenue = (decimal?)null,
                },
            },
            sales = Array.Empty<object>(),
            tips = 300m,
            tips_cash = (decimal?)null,
            deductions = 0m,
            deduction_reason = (string?)null,
            note = (string?)null,
        })).EnsureSuccessStatusCode();

        gaps = (await Read(await client.GetAsync("/shifter/v1/health/records")))
            .EnumerateArray().ToArray();

        Assert.DoesNotContain(gaps, gap => gap.GetProperty("kind").GetString() == "tips_unsaid");
        Assert.DoesNotContain(gaps, gap => gap.GetProperty("kind").GetString() == "actual_times_unsaid");
        Assert.Contains(gaps, gap => gap.GetProperty("kind").GetString() == "city_unsaid");
    }
}
