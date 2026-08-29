using System.Net.Http.Json;
using System.Text.Json;

using Xunit;

namespace Shifter.Api.Tests;

/// <summary>
/// What comes off a wage, and what each figure means once several of them
/// stack.
///
/// This is where arithmetic errors compound quietly: a tip-out, a meal, income
/// tax and a holiday accrual all touch the same day, and each of them has a
/// different relationship with the total. Tax comes out of take-home; a
/// holiday accrual is owed later and is never part of it; an expense happened
/// after the money arrived and is subtracted from nothing at all.
/// </summary>
[Collection("api")]
public sealed class DeductionsOverHttpTests(Api api)
{
    private static string Day(int day) => $"2026-06-{day:00}";

    private static async Task<JsonElement> Read(HttpResponseMessage response)
    {
        var body = await response.Content.ReadAsStringAsync();

        Assert.True(
            response.IsSuccessStatusCode,
            $"{(int)response.StatusCode} {response.RequestMessage?.RequestUri}: {body}");

        return JsonDocument.Parse(body).RootElement.Clone();
    }

    private static async Task<int> PlaceAsync(
        HttpClient client,
        string name,
        decimal tipOutOfTips = 0m,
        decimal meal = 0m,
        decimal taxPercent = 0m,
        bool taxTips = false,
        decimal holidayPercent = 0m)
    {
        var made = await Read(await client.PostAsJsonAsync(
            "/shifter/v1/locations",
            new
            {
                name,
                address = (string?)null,
                colour = "#1F3A5F",
                pay_period = "monthly",
                pay_day = 10,
                pay_anchor = (DateOnly?)null,
                overtime_weekly_hours = 40d,
                overtime_multiplier = 1.5m,
                night_multiplier = 1m,
                night_from = "22:00",
                night_to = "06:00",
                public_holiday_multiplier = 1m,
                holiday_country = "",
                tip_out_of_tips_percent = tipOutOfTips,
                tip_out_of_sales_percent = 0m,
                meal_deduction = meal,
                tax_percent = taxPercent,
                tax_tips = taxTips,
                holiday_percent = holidayPercent,
                currency = (string?)null,
            }));

        return made.GetProperty("id").GetInt32();
    }

    private static async Task<int> ShiftAsync(
        HttpClient client,
        int placeId,
        decimal hourly,
        string tipSource = "personal",
        decimal? poolShare = null)
    {
        var made = await Read(await client.PostAsJsonAsync(
            "/shifter/v1/shifts",
            new
            {
                name = "Смена",
                symbol = (string?)null,
                location_id = placeId,
                start_time = "10:00",
                end_time = "18:00",
                salary_period = "hour",
                salary_amount = hourly,
                break_minutes = 0,
                colour = (string?)null,
                revenue_percent = (decimal?)null,
                tip_source = tipSource,
                tip_pool_percent = poolShare,
            }));

        return made.GetProperty("id").GetInt32();
    }

    private static Task<HttpResponseMessage> WorkAsync(
        HttpClient client,
        string date,
        int shiftId,
        decimal? tips = null,
        decimal? pool = null,
        decimal deductions = 0m)
        => client.PutAsJsonAsync($"/shifter/v1/days/{date}", new
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
            tips,
            tips_cash = (decimal?)null,
            deductions,
            deduction_reason = deductions > 0m ? "breakage" : null,
            note = (string?)null,
            tip_pool = pool,
        });

    private static async Task<JsonElement> RangeAsync(HttpClient client)
        => await Read(await client.GetAsync($"/shifter/v1/days?from={Day(1)}&to={Day(30)}"));

    [Fact]
    public async Task A_pooled_share_is_derived_and_not_typed()
    {
        // The pool is the fact somebody can see; their slice of it is
        // arithmetic. Letting both be entered by hand is how the two stop
        // agreeing.
        var (client, _) = await api.SignInAsync("pool");
        var place = await PlaceAsync(client, "Бар");
        var shift = await ShiftAsync(client, place, 100m, tipSource: "pool", poolShare: 20m);

        // A pool of five thousand, a fifth of it this person's — and a typed
        // figure of nine hundred, which must lose to the arithmetic.
        (await WorkAsync(client, Day(2), shift, tips: 900m, pool: 5_000m))
            .EnsureSuccessStatusCode();

        var range = await RangeAsync(client);

        Assert.Equal(1_000m, range.GetProperty("tips_earned").GetDecimal());
    }

    [Fact]
    public async Task A_tip_out_leaves_the_total_and_is_named()
    {
        var (client, _) = await api.SignInAsync("tipout");
        var place = await PlaceAsync(client, "Бар", tipOutOfTips: 10m);
        var shift = await ShiftAsync(client, place, 100m);

        (await WorkAsync(client, Day(2), shift, tips: 1_000m)).EnsureSuccessStatusCode();

        var range = await RangeAsync(client);

        Assert.Equal(100m, range.GetProperty("tip_out").GetDecimal());

        // Eight hours at a hundred, plus a thousand in tips, less the hundred
        // handed to the runners.
        Assert.Equal(800m + 1_000m - 100m, range.GetProperty("total_earned").GetDecimal());
    }

    [Fact]
    public async Task Tax_comes_out_of_take_home_and_a_holiday_accrual_does_not()
    {
        // Two figures with opposite relationships to the same total: one has
        // already gone, the other is owed later and has not.
        var (client, _) = await api.SignInAsync("tax2");
        var place = await PlaceAsync(client, "Бар", taxPercent: 20m, holidayPercent: 10m);
        var shift = await ShiftAsync(client, place, 100m);

        (await WorkAsync(client, Day(2), shift)).EnsureSuccessStatusCode();

        var range = await RangeAsync(client);

        var earned = range.GetProperty("total_earned").GetDecimal();
        var tax = range.GetProperty("tax").GetDecimal();
        var net = range.GetProperty("net_earned").GetDecimal();
        var holiday = range.GetProperty("holiday_accrued").GetDecimal();

        Assert.Equal(800m, earned);
        Assert.Equal(160m, tax);
        Assert.Equal(earned - tax, net);

        // Accrued, and deliberately outside both figures above it.
        Assert.Equal(80m, holiday);
    }

    [Fact]
    public async Task Tips_are_taxed_only_where_the_place_says_they_are()
    {
        var (client, _) = await api.SignInAsync("taxtips");
        var untaxed = await PlaceAsync(client, "Без налога на чай", taxPercent: 20m, taxTips: false);
        var shift = await ShiftAsync(client, untaxed, 100m);

        (await WorkAsync(client, Day(2), shift, tips: 1_000m)).EnsureSuccessStatusCode();

        var range = await RangeAsync(client);

        // A fifth of the wage and nothing of the tips.
        Assert.Equal(160m, range.GetProperty("tax").GetDecimal());
    }

    [Fact]
    public async Task A_fine_keeps_the_reason_it_was_given_for()
    {
        // Five broken glasses and one till shortfall add up the same and mean
        // completely different things.
        var (client, _) = await api.SignInAsync("fine");
        var place = await PlaceAsync(client, "Бар");
        var shift = await ShiftAsync(client, place, 100m);

        (await WorkAsync(client, Day(2), shift, deductions: 250m)).EnsureSuccessStatusCode();

        var range = await RangeAsync(client);

        Assert.Equal(250m, range.GetProperty("deductions").GetDecimal());

        var reasons = range.GetProperty("deductions_by_reason").EnumerateArray().ToArray();

        Assert.Single(reasons);
        Assert.Equal("breakage", reasons[0].GetProperty("reason").GetString());
        Assert.Equal(250m, reasons[0].GetProperty("amount").GetDecimal());
    }

    [Fact]
    public async Task A_percentage_of_no_tips_is_absent_rather_than_large()
    {
        // A share of nothing is undefined, and rendering it as a number is how
        // a screen ends up claiming travel ate a thousand per cent.
        var (client, _) = await api.SignInAsync("share");
        var place = await PlaceAsync(client, "Бар");
        var shift = await ShiftAsync(client, place, 100m);

        (await WorkAsync(client, Day(2), shift)).EnsureSuccessStatusCode();

        var range = await RangeAsync(client);

        Assert.Equal(
            JsonValueKind.Null, range.GetProperty("travel_share_of_tips").ValueKind);
    }
}
