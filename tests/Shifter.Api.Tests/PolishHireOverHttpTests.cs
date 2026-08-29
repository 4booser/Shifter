using System.Net.Http.Json;
using System.Text.Json;

using Xunit;

namespace Shifter.Api.Tests;

/// <summary>
/// The umowa-zlecenie story, walked whole: a PLN place with the person's own
/// rate, their own deduction percent and their own minimum-wage floor — and
/// not one legal number from the app's head.
///
/// The pieces were built by earlier waves (place currency, tax percent,
/// MinimumHourly, below_floor); this test is the proof they compose into the
/// Polish hire the plan describes, and the tripwire if a refactor uncouples
/// them.
/// </summary>
[Collection("api")]
public sealed class PolishHireOverHttpTests(Api api)
{
    private static async Task<JsonElement> Read(HttpResponseMessage response)
    {
        response.EnsureSuccessStatusCode();

        return JsonDocument.Parse(await response.Content.ReadAsStringAsync()).RootElement;
    }

    [Fact]
    public async Task A_pln_place_runs_on_the_persons_own_numbers_and_nothing_else()
    {
        var (client, _) = await api.SignInAsync("umowa");

        // Their paperwork, their numbers: 30.50 zł/h, 22.71% deductions
        // (składki + zaliczka as one figure they computed themselves), and
        // the 2026 minimum they typed in — not one of these came from us.
        var place = await client.PostAsJsonAsync("/shifter/v1/locations", new
        {
            name = "Kawiarnia Wrocław",
            address = (string?)null,
            colour = "#8a2f2f",
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
            tax_percent = 22.71m,
            tax_tips = false,
            holiday_percent = 0m,
            currency = "PLN",
            minimum_hourly = 30.50m,
        });

        place.EnsureSuccessStatusCode();

        var placeId = (await place.Content.ReadFromJsonAsync<JsonElement>())
            .GetProperty("id").GetInt32();

        // Two templates at the same place: the honest 31 zł and the 28 zł
        // somebody was actually offered for weekends.
        async Task<int> ShiftAsync(string name, decimal rate)
        {
            var response = await client.PostAsJsonAsync("/shifter/v1/shifts", new
            {
                name,
                symbol = (string?)null,
                location_id = placeId,
                start_time = "09:00",
                end_time = "17:00",
                salary_period = "hour",
                salary_amount = rate,
                break_minutes = 0,
            });

            return (await Read(response)).GetProperty("id").GetInt32();
        }

        var fair = await ShiftAsync("Zmiana", 31m);
        var cheap = await ShiftAsync("Weekend", 28m);

        async Task WorkAsync(string date, int shiftId)
        {
            (await client.PutAsJsonAsync($"/shifter/v1/days/{date}", new
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
        }

        await WorkAsync("2026-07-06", fair);
        await WorkAsync("2026-07-11", cheap);

        var range = await Read(await client.GetAsync("/shifter/v1/days?from=2026-07-01&to=2026-07-31"));
        var days = range.GetProperty("days").EnumerateArray().ToArray();

        var fairDay = days.Single(day => day.GetProperty("date").GetString() == "2026-07-06");
        var cheapDay = days.Single(day => day.GetProperty("date").GetString() == "2026-07-11");

        // The floor is THEIR 30.50: 31 clears it, 28 is flagged — by their
        // number, not by any statute we shipped.
        Assert.False(fairDay.GetProperty("below_floor").GetBoolean());
        Assert.True(cheapDay.GetProperty("below_floor").GetBoolean());

        // Gross: 8h × 31 + 8h × 28 = 472 zł, stated in the place's money.
        Assert.Equal(472m, range.GetProperty("total_earned").GetDecimal());

        // Net: their 22.71% off, and nothing else — no rate of ours between
        // their brutto and their netto. 472 × (1 − 0.2271) = 364.8088.
        var tax = range.GetProperty("tax").GetDecimal();
        var net = range.GetProperty("net_earned").GetDecimal();

        Assert.Equal(107.19m, Math.Round(tax, 2));
        Assert.Equal(364.81m, Math.Round(net, 2));
    }
}
