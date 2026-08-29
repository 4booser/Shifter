using System.Net;
using System.Net.Http.Json;
using System.Text.Json;

using Xunit;

namespace Shifter.Api.Tests;

/// <summary>
/// The promises this application makes about money, asked of the running
/// server rather than of a fake.
///
/// Each one here is a sentence the product says out loud somewhere: overtime
/// is paid at the premium above the ordinary rate; a meal is only deducted
/// from a day somebody worked; an estimate is never mixed with a fact; nothing
/// is said where there is not enough to say it with.
/// </summary>
[Collection("api")]
public sealed class PromisesOverHttpTests(Api api)
{
    private static string Day(int day) => $"2026-04-{day:00}";

    private static async Task<JsonElement> Read(HttpResponseMessage response)
    {
        var body = await response.Content.ReadAsStringAsync();

        Assert.True(
            response.IsSuccessStatusCode,
            $"{(int)response.StatusCode} {response.RequestMessage?.RequestUri}: {body}");

        return JsonDocument.Parse(body).RootElement.Clone();
    }

    private static Task<HttpResponseMessage> CreatePlaceAsync(
        HttpClient client,
        string name,
        double overtimeAfter = 40,
        decimal overtimeMultiplier = 1.5m,
        decimal meal = 0m)
        => client.PostAsJsonAsync(
            "/shifter/v1/locations",
            new
            {
                name,
                address = (string?)null,
                colour = "#1F3A5F",
                pay_period = "monthly",
                pay_day = 10,
                pay_anchor = (DateOnly?)null,
                overtime_weekly_hours = overtimeAfter,
                overtime_multiplier = overtimeMultiplier,
                night_multiplier = 1m,
                night_from = "22:00",
                night_to = "06:00",
                public_holiday_multiplier = 1m,
                holiday_country = "",
                tip_out_of_tips_percent = 0m,
                tip_out_of_sales_percent = 0m,
                meal_deduction = meal,
                tax_percent = 0m,
                tax_tips = false,
                holiday_percent = 0m,
                currency = (string?)null,
            });

    private static async Task<int> PlaceAsync(
        HttpClient client,
        string name,
        double overtimeAfter = 40,
        decimal overtimeMultiplier = 1.5m,
        decimal meal = 0m)
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
                overtime_weekly_hours = overtimeAfter,
                overtime_multiplier = overtimeMultiplier,
                night_multiplier = 1m,
                night_from = "22:00",
                night_to = "06:00",
                public_holiday_multiplier = 1m,
                holiday_country = "",
                tip_out_of_tips_percent = 0m,
                tip_out_of_sales_percent = 0m,
                meal_deduction = meal,
                tax_percent = 0m,
                tax_tips = false,
                holiday_percent = 0m,
                currency = (string?)null,
            }));

        return made.GetProperty("id").GetInt32();
    }

    private static async Task<int> ShiftAsync(
        HttpClient client, string name, int placeId, decimal hourly, string start, string end)
    {
        var made = await Read(await client.PostAsJsonAsync(
            "/shifter/v1/shifts",
            new
            {
                name,
                symbol = (string?)null,
                location_id = placeId,
                start_time = start,
                end_time = end,
                salary_period = "hour",
                salary_amount = hourly,
                break_minutes = 0,
            }));

        return made.GetProperty("id").GetInt32();
    }

    private static Task<HttpResponseMessage> WorkAsync(
        HttpClient client, string date, int shiftId, decimal? tips = null, bool worked = true)
        => client.PutAsJsonAsync($"/shifter/v1/days/{date}", new
        {
            shifts = new[]
            {
                new
                {
                    shift_id = shiftId,
                    worked,
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
            deductions = 0m,
            deduction_reason = (string?)null,
            note = (string?)null,
        });

    private static async Task<JsonElement> RangeAsync(HttpClient client, string from, string to)
        => await Read(await client.GetAsync($"/shifter/v1/days?from={from}&to={to}"));

    [Fact]
    public async Task Overtime_pays_the_premium_and_never_takes_money_away()
    {
        // Legacy places carried a multiplier of zero, and the premium was
        // computed as multiplier − 1. Every overtime hour then paid minus one
        // times the rate: the longer somebody worked, the less they earned.
        var (client, _) = await api.SignInAsync("overtime");
        var place = await PlaceAsync(client, "Бар", overtimeAfter: 40, overtimeMultiplier: 1.5m);
        var shift = await ShiftAsync(client, "Смена", place, 100m, "10:00", "22:00");

        // Six twelve-hour days in one week: seventy-two hours, thirty-two of
        // them over the line.
        foreach (var day in new[] { 6, 7, 8, 9, 10, 11 })
            (await WorkAsync(client, Day(day), shift)).EnsureSuccessStatusCode();

        var range = await RangeAsync(client, Day(1), Day(30));

        var earned = range.GetProperty("total_earned").GetDecimal();

        // Seventy-two hours at a hundred is 7 200, and the thirty-two overtime
        // hours earn half as much again on top.
        Assert.Equal(7_200m + 32 * 50m, earned);
        Assert.True(earned > 7_200m, "overtime must never reduce a week's pay");
    }

    [Fact]
    public async Task An_overtime_line_of_zero_is_refused_rather_than_stored()
    {
        // Zero once read as "not stated" through a null-coalescing default, so
        // a place whose threshold was zero paid a premium on every hour. The
        // rows that carried it were repaired; this is the door it came in by,
        // and the door is now shut.
        var (client, _) = await api.SignInAsync("nothreshold");

        var refused = await CreatePlaceAsync(client, "Кухня", overtimeAfter: 0);

        Assert.Equal(HttpStatusCode.BadRequest, refused.StatusCode);
    }

    [Fact]
    public async Task An_overtime_multiplier_below_one_is_refused_rather_than_stored()
    {
        // The other half of the same defect: a multiplier under one makes the
        // premium negative, and an overtime hour then costs somebody money.
        var (client, _) = await api.SignInAsync("nomultiplier");

        var refused = await CreatePlaceAsync(client, "Бар", overtimeMultiplier: 0m);

        Assert.Equal(HttpStatusCode.BadRequest, refused.StatusCode);
    }

    [Fact]
    public async Task A_meal_is_deducted_from_a_day_that_was_worked_and_not_from_a_plan()
    {
        // A day carrying only a plan came back at minus eighty.
        var (client, _) = await api.SignInAsync("meal");
        var place = await PlaceAsync(client, "Столовая", meal: 80m);
        var shift = await ShiftAsync(client, "Смена", place, 100m, "10:00", "18:00");

        (await WorkAsync(client, Day(6), shift, worked: false)).EnsureSuccessStatusCode();

        var planned = await RangeAsync(client, Day(1), Day(30));

        Assert.Equal(0m, planned.GetProperty("total_earned").GetDecimal());

        (await WorkAsync(client, Day(7), shift)).EnsureSuccessStatusCode();

        var worked = await RangeAsync(client, Day(1), Day(30));

        Assert.Equal(800m - 80m, worked.GetProperty("total_earned").GetDecimal());
    }

    [Fact]
    public async Task A_payout_and_what_was_earned_are_compared_rather_than_conflated()
    {
        var (client, _) = await api.SignInAsync("payout");
        var place = await PlaceAsync(client, "Бар");
        var shift = await ShiftAsync(client, "Смена", place, 100m, "10:00", "18:00");

        (await WorkAsync(client, Day(6), shift)).EnsureSuccessStatusCode();

        (await client.PostAsJsonAsync("/shifter/v1/payouts", new
        {
            location_id = place,
            period_from = Day(1),
            period_to = Day(30),
            amount = 600m,
            received_on = Day(30),
            note = (string?)null,
        })).EnsureSuccessStatusCode();

        var range = await RangeAsync(client, Day(1), Day(30));

        Assert.Equal(800m, range.GetProperty("total_earned").GetDecimal());
        Assert.Equal(600m, range.GetProperty("paid").GetDecimal());

        // Short by two hundred, and said as a difference rather than folded
        // into either figure.
        Assert.Equal(-200m, range.GetProperty("difference").GetDecimal());
    }

    [Fact]
    public async Task The_market_says_nothing_where_there_is_nothing_to_say()
    {
        // Five separate employers and eight postings before a figure appears.
        // A city with three venues on it gets silence, which is the correct
        // answer and the one a client can tell apart from zero.
        var (client, _) = await api.SignInAsync("market");

        var band = await Read(await client.GetAsync(
            "/shifter/v1/gigs/market?city=Тестоград&category=bartender"));

        Assert.Equal(JsonValueKind.Null, band.GetProperty("median").ValueKind);
        Assert.Equal(JsonValueKind.Null, band.GetProperty("employers").ValueKind);
    }

    [Fact]
    public async Task A_tax_year_nobody_described_is_absent_rather_than_zero()
    {
        // No profile returns null rather than a tidy row of zeroes, which
        // would draw a tax bill of nothing for somebody who has said nothing.
        var (client, _) = await api.SignInAsync("tax");

        var reading = await Read(await client.GetAsync("/shifter/v1/tax/2026"));

        Assert.Equal(JsonValueKind.Null, reading.GetProperty("profile").ValueKind);
    }

    [Fact]
    public async Task A_tax_profile_applies_only_the_rates_it_was_given()
    {
        var (client, _) = await api.SignInAsync("taxrates");

        (await client.PutAsJsonAsync("/shifter/v1/tax", new
        {
            name = "ФОП 2 група",
            year = 2026,
            percent = (decimal?)null,
            fixed_monthly = 1_600m,
            social_monthly = 1_760m,
            annual_limit = 8_285_700m,
            basis = "earned",
        })).EnsureSuccessStatusCode();

        var reading = await Read(await client.GetAsync("/shifter/v1/tax/2026?today=2026-08-29"));

        // No percentage was given, so none is applied — and null rather than
        // zero, because "nothing owed" and "you have not told us" differ.
        Assert.Equal(JsonValueKind.Null, reading.GetProperty("on_income").ValueKind);
        Assert.Equal(12_800m, reading.GetProperty("flat").GetDecimal());
        Assert.Equal(14_080m, reading.GetProperty("social").GetDecimal());
    }

    [Fact]
    public async Task A_contract_fragment_is_not_a_contract_with_ten_omissions()
    {
        var (client, _) = await api.SignInAsync("contract");

        var read = await Read(await client.PostAsJsonAsync(
            "/shifter/v1/contract/questions", new { text = "Трудовой договор" }));

        Assert.False(read.GetProperty("read").GetBoolean());
        Assert.Empty(read.GetProperty("missing").EnumerateArray());
        Assert.Empty(read.GetProperty("also").EnumerateArray());
    }

    [Fact]
    public async Task An_advert_that_says_nothing_fills_in_nothing()
    {
        var (client, _) = await api.SignInAsync("advert");

        var read = await Read(await client.PostAsJsonAsync(
            "/shifter/v1/advert/read",
            new { text = "Дружний колектив, гарні умови, телефонуйте 0501234567" }));

        foreach (var field in new[] { "pay_amount", "pay_period", "percent", "start", "end" })
            Assert.Equal(JsonValueKind.Null, read.GetProperty(field).ValueKind);
    }

    [Fact]
    public async Task Unsubscribing_from_a_letter_needs_no_sign_in_and_leaks_nothing()
    {
        // The same page whether the key was real or not: a link that said "no
        // such subscription" would turn the endpoint into a way of testing
        // keys, and would worry the person who clicked twice.
        var stranger = api.CreateClient();

        var real = await stranger.GetAsync("/letters/stop?key=definitelynotarealkey");
        var empty = await stranger.GetAsync("/letters/stop");

        Assert.Equal(HttpStatusCode.OK, real.StatusCode);
        Assert.Equal(HttpStatusCode.OK, empty.StatusCode);
        Assert.Equal(
            await real.Content.ReadAsStringAsync(),
            await empty.Content.ReadAsStringAsync());
    }

    [Fact]
    public async Task A_draft_fifth_shift_prices_dearer_than_a_first_one()
    {
        // The one thing a head gets wrong pricing a подработка: the fifth
        // shift of a week crosses the overtime line the first four built up
        // to. Only the server can see both halves, and it must write nothing.
        var (client, _) = await api.SignInAsync("draft");
        var place = await PlaceAsync(client, "Бар", overtimeAfter: 40, overtimeMultiplier: 1.5m);
        var shift = await ShiftAsync(client, "Смена", place, 100m, "10:00", "20:00");

        // Four real ten-hour days: forty hours, the line exactly reached.
        foreach (var day in new[] { 6, 7, 8, 9 })
            (await WorkAsync(client, Day(day), shift)).EnsureSuccessStatusCode();

        var lone = await Read(await client.PostAsJsonAsync(
            "/shifter/v1/days/price",
            new { shift_id = shift, dates = new[] { "2026-04-20" } }));

        var fifth = await Read(await client.PostAsJsonAsync(
            "/shifter/v1/days/price",
            new { shift_id = shift, dates = new[] { Day(10) } }));

        // Alone in an empty week: a thousand, no premium.
        Assert.Equal(1_000m, lone.GetProperty("total").GetDecimal());
        Assert.Equal(0m, lone.GetProperty("overtime_extra").GetDecimal());

        // Into the loaded week: every hour is past the line, half again on top.
        Assert.Equal(1_000m, fifth.GetProperty("base_pay").GetDecimal());
        Assert.Equal(500m, fifth.GetProperty("overtime_extra").GetDecimal());
        Assert.Equal(1_500m, fifth.GetProperty("total").GetDecimal());

        // And nothing was written: the range still holds four days.
        var range = await RangeAsync(client, Day(1), Day(30));

        Assert.Equal(4, range.GetProperty("days_worked").GetInt32());
        Assert.Equal(0m, range.GetProperty("planned_earned").GetDecimal());
    }

    [Fact]
    public async Task A_payout_can_be_corrected_in_place_and_the_reconciliation_follows()
    {
        var (client, _) = await api.SignInAsync("payedit");
        var place = await PlaceAsync(client, "Бар");
        var shift = await ShiftAsync(client, "Смена", place, 100m, "10:00", "18:00");

        (await WorkAsync(client, Day(6), shift)).EnsureSuccessStatusCode();

        var created = await Read(await client.PostAsJsonAsync("/shifter/v1/payouts", new
        {
            location_id = place,
            period_from = Day(1),
            period_to = Day(30),
            amount = 600m,
            received_on = Day(30),
            note = "спутал сумму",
        }));

        var id = created.GetProperty("id").GetInt32();

        // The typo fixed in place: 600 was really 800, and the month settles.
        var updated = await Read(await client.PutAsJsonAsync($"/shifter/v1/payouts/{id}", new
        {
            location_id = place,
            period_from = Day(1),
            period_to = Day(30),
            amount = 800m,
            received_on = Day(30),
            note = (string?)null,
        }));

        Assert.Equal(800m, updated.GetProperty("amount").GetDecimal());
        Assert.True(updated.GetProperty("note").ValueKind == JsonValueKind.Null);

        var range = await RangeAsync(client, Day(1), Day(30));

        Assert.Equal(0m, range.GetProperty("difference").GetDecimal());

        // And what a create refuses, an edit refuses too.
        var refused = await client.PutAsJsonAsync($"/shifter/v1/payouts/{id}", new
        {
            location_id = place,
            period_from = Day(30),
            period_to = Day(1),
            amount = 800m,
            received_on = Day(30),
            note = (string?)null,
        });

        Assert.Equal(HttpStatusCode.BadRequest, refused.StatusCode);
    }

    [Fact]
    public async Task The_clean_slate_takes_every_payout_and_every_verdict_with_it()
    {
        var (client, _) = await api.SignInAsync("paywipe");
        var place = await PlaceAsync(client, "Бар");
        var shift = await ShiftAsync(client, "Смена", place, 100m, "10:00", "18:00");

        (await WorkAsync(client, Day(6), shift)).EnsureSuccessStatusCode();

        foreach (var amount in new[] { 300m, 200m })
        {
            (await client.PostAsJsonAsync("/shifter/v1/payouts", new
            {
                location_id = place,
                period_from = Day(1),
                period_to = Day(30),
                amount,
                received_on = Day(30),
                note = (string?)null,
            })).EnsureSuccessStatusCode();
        }

        // A verdict on the shortfall — the kind of thing that must not
        // survive the wipe as a ghost «paid» over money that no longer
        // exists.
        (await client.PostAsJsonAsync("/shifter/v1/payouts/settle", new
        {
            location_id = place,
            period_from = Day(1),
            stream = "all",
            kind = "paid",
            note = (string?)null,
        })).EnsureSuccessStatusCode();

        var wiped = await Read(await client.DeleteAsync("/shifter/v1/payouts"));

        Assert.Equal(2, wiped.GetProperty("deleted").GetInt32());

        var list = JsonDocument.Parse(await client.GetStringAsync(
            $"/shifter/v1/payouts?from={Day(1)}&to={Day(30)}")).RootElement;

        Assert.Empty(list.EnumerateArray());

        // The slate is genuinely clean — and clean means back to «nothing
        // said», not «short by everything»: with no payouts recorded the
        // range reports a difference of zero by design, because an empty
        // ledger is not an accusation.
        var range = await RangeAsync(client, Day(1), Day(30));

        Assert.Equal(0m, range.GetProperty("paid").GetDecimal());
        Assert.Equal(0m, range.GetProperty("difference").GetDecimal());
    }

    [Fact]
    public async Task Two_devices_editing_one_day_get_a_conflict_not_a_silent_merge()
    {
        var (client, _) = await api.SignInAsync("conflict");
        var place = await PlaceAsync(client, "Бар");
        var shift = await ShiftAsync(client, "Смена", place, 100m, "10:00", "18:00");

        object Body(decimal? tips, int? version) => new
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
                    revenue = (decimal?)null,
                },
            },
            sales = Array.Empty<object>(),
            tips,
            tips_cash = (decimal?)null,
            deductions = 0m,
            deduction_reason = (string?)null,
            note = (string?)null,
            version,
        };

        // Both devices open an empty day: both see version zero. The first
        // save lands and stamps version one.
        var first = await Read(await client.PutAsJsonAsync(
            $"/shifter/v1/days/{Day(12)}", Body(300m, 0)));

        Assert.Equal(1, first.GetProperty("version").GetInt32());

        // The second device still holds zero: refused, with the other
        // evening intact.
        var stale = await client.PutAsJsonAsync($"/shifter/v1/days/{Day(12)}", Body(500m, 0));

        Assert.Equal(HttpStatusCode.Conflict, stale.StatusCode);

        var kept = await Read(await client.GetAsync($"/shifter/v1/days?from={Day(12)}&to={Day(12)}"));
        var day = kept.GetProperty("days").EnumerateArray().Single();

        Assert.Equal(300m, day.GetProperty("tips").GetDecimal());

        // Echoing the version it just reloaded, the second device may write.
        var fresh = await Read(await client.PutAsJsonAsync(
            $"/shifter/v1/days/{Day(12)}", Body(500m, day.GetProperty("version").GetInt32())));

        Assert.Equal(2, fresh.GetProperty("version").GetInt32());

        // And a client that has never heard of versions still wins last:
        // it cannot be asked, and refusing it would brick old phones.
        (await client.PutAsJsonAsync(
            $"/shifter/v1/days/{Day(12)}", Body(700m, null))).EnsureSuccessStatusCode();
    }

    [Fact]
    public async Task A_crossed_goal_lands_on_the_shelf_and_stays_there()
    {
        var (client, _) = await api.SignInAsync("shelf");
        var place = await PlaceAsync(client, "Бар");
        var shift = await ShiftAsync(client, "Смена", place, 100m, "10:00", "18:00");

        // A weekly goal of 500: one 800-hryvnia day crosses it.
        (await client.PutAsJsonAsync("/shifter/v1/goals", new
        {
            period = "week",
            amount = 500m,
            anchor = (DateOnly?)null,
            note = (string?)null,
        })).EnsureSuccessStatusCode();

        var today = DateOnly.FromDateTime(DateTime.UtcNow);

        (await WorkAsync(client, today.ToString("yyyy-MM-dd"), shift)).EnsureSuccessStatusCode();

        var history = await Read(await client.GetAsync("/shifter/v1/goals/history"));
        var cheers = history.GetProperty("cheers").EnumerateArray().ToArray();

        Assert.Single(cheers);
        Assert.Equal("week", cheers[0].GetProperty("period").GetString());
        Assert.Equal(500m, cheers[0].GetProperty("amount").GetDecimal());
        Assert.Equal(1, history.GetProperty("weekly_streak").GetInt32());

        // Saving the same day again must not double the trophy: each period
        // is cheered exactly once.
        (await WorkAsync(client, today.ToString("yyyy-MM-dd"), shift)).EnsureSuccessStatusCode();

        history = await Read(await client.GetAsync("/shifter/v1/goals/history"));

        Assert.Single(history.GetProperty("cheers").EnumerateArray().ToArray());

        // Raising the bar later does not rewrite the trophy already won.
        (await client.PutAsJsonAsync("/shifter/v1/goals", new
        {
            period = "week",
            amount = 9_000m,
            anchor = (DateOnly?)null,
            note = (string?)null,
        })).EnsureSuccessStatusCode();

        history = await Read(await client.GetAsync("/shifter/v1/goals/history"));

        Assert.Equal(500m, history.GetProperty("cheers")[0].GetProperty("amount").GetDecimal());
    }

    [Fact]
    public async Task Every_save_leaves_a_line_in_the_days_own_history()
    {
        var (client, _) = await api.SignInAsync("audit");
        var place = await PlaceAsync(client, "Бар");
        var shift = await ShiftAsync(client, "Смена", place, 100m, "10:00", "18:00");

        (await WorkAsync(client, Day(16), shift)).EnsureSuccessStatusCode();
        (await WorkAsync(client, Day(16), shift)).EnsureSuccessStatusCode();

        var trail = (await Read(await client.GetAsync($"/shifter/v1/days/{Day(16)}/history")))
            .GetProperty("entries").EnumerateArray().ToArray();

        // Two saves, two lines, newest first, each carrying the snapshot it
        // left behind — the figures a person can check against the calendar.
        Assert.Equal(2, trail.Length);
        Assert.Equal("app", trail[0].GetProperty("source").GetString());
        Assert.Equal(800m, trail[0].GetProperty("earned").GetDecimal());
        Assert.Equal(1, trail[0].GetProperty("worked_count").GetInt32());
        Assert.True(trail[0].GetProperty("at").GetDateTime() >= trail[1].GetProperty("at").GetDateTime());
    }
}

