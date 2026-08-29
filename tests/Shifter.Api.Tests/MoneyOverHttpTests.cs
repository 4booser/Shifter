using System.Net.Http.Json;
using System.Text.Json;

using Xunit;

namespace Shifter.Api.Tests;

/// <summary>
/// What a month comes to, asked of the running server.
///
/// Every money defect found this week — overtime at a negative multiplier,
/// every hour counted as overtime, a meal deducted from a day nobody worked, a
/// year of salary missing from a tax figure — survived a unit test on fakes
/// and would not have survived this. The difference is that here the figure
/// travels through the controller, the handler, EF and Postgres, which is what
/// it does for a person.
/// </summary>
[Collection("api")]
public sealed class MoneyOverHttpTests(Api api)
{
    private static string Day(int day) => $"2026-03-{day:00}";

    private static async Task<JsonElement> Read(HttpResponseMessage response)
    {
        var body = await response.Content.ReadAsStringAsync();

        Assert.True(
            response.IsSuccessStatusCode,
            $"{(int)response.StatusCode} {response.RequestMessage?.RequestUri}: {body}");

        return JsonDocument.Parse(body).RootElement.Clone();
    }

    private static async Task<int> ShiftAsync(
        HttpClient client,
        string name,
        string period,
        decimal amount,
        string start = "10:00",
        string end = "18:00",
        int breakMinutes = 0)
    {
        var made = await Read(await client.PostAsJsonAsync(
            "/shifter/v1/shifts",
            new
            {
                name,
                symbol = (string?)null,
                location_id = (int?)null,
                start_time = start,
                end_time = end,
                salary_period = period,
                salary_amount = amount,
                break_minutes = breakMinutes,
            }));

        return made.GetProperty("id").GetInt32();
    }

    private static Task<HttpResponseMessage> SaveAsync(
        HttpClient client, string date, object body)
        => client.PutAsJsonAsync($"/shifter/v1/days/{date}", body);

    private static object Placed(int shiftId, bool worked = true) => new
    {
        shift_id = shiftId,
        worked,
        needs_cover = false,
        actual_start = (string?)null,
        actual_end = (string?)null,
        break_minutes = (int?)null,
        revenue = (decimal?)null,
    };

    private static async Task<JsonElement> RangeAsync(HttpClient client, string from, string to)
        => await Read(await client.GetAsync($"/shifter/v1/days?from={from}&to={to}"));

    [Fact]
    public async Task An_hourly_day_is_worth_its_hours_times_its_rate()
    {
        var (client, _) = await api.SignInAsync("hourly");
        var shift = await ShiftAsync(client, "День", "hour", 200m);

        (await SaveAsync(client, Day(2), new
        {
            shifts = new[] { Placed(shift) },
            sales = Array.Empty<object>(),
            tips = 500m,
            tips_cash = 200m,
            deductions = 0m,
            deduction_reason = (string?)null,
            note = (string?)null,
        })).EnsureSuccessStatusCode();

        var range = await RangeAsync(client, Day(1), Day(31));

        // Eight hours at two hundred, plus five hundred in tips.
        Assert.Equal(2_100m, range.GetProperty("total_earned").GetDecimal());
        Assert.Equal(8d, range.GetProperty("hours").GetDouble());
    }

    [Fact]
    public async Task A_monthly_salary_reaches_the_total()
    {
        // The defect that hid in two places written the same evening: a
        // salaried shift's own pay is nothing, because the wage belongs to the
        // period. Anything that sums shift pay reports a month of tips alone.
        var (client, _) = await api.SignInAsync("salary");
        var shift = await ShiftAsync(client, "Оклад", "month", 30_000m);

        foreach (var day in new[] { 2, 3, 4, 5 })
        {
            (await SaveAsync(client, Day(day), new
            {
                shifts = new[] { Placed(shift) },
                sales = Array.Empty<object>(),
                tips = (decimal?)null,
                tips_cash = (decimal?)null,
                deductions = 0m,
                deduction_reason = (string?)null,
                note = (string?)null,
            })).EnsureSuccessStatusCode();
        }

        var range = await RangeAsync(client, Day(1), Day(31));

        Assert.Equal(30_000m, range.GetProperty("total_earned").GetDecimal());
    }

    [Fact]
    public async Task A_salary_is_not_paid_once_per_day_it_was_worked()
    {
        // Four days of a monthly wage is one wage, not four. The share is per
        // day worked, so any range containing all of them adds to the salary
        // and no range containing none of them claims a penny.
        var (client, _) = await api.SignInAsync("salaryhalf");
        var shift = await ShiftAsync(client, "Оклад", "month", 30_000m);

        foreach (var day in new[] { 2, 3, 20, 21 })
        {
            (await SaveAsync(client, Day(day), new
            {
                shifts = new[] { Placed(shift) },
                sales = Array.Empty<object>(),
                tips = (decimal?)null,
                tips_cash = (decimal?)null,
                deductions = 0m,
                deduction_reason = (string?)null,
                note = (string?)null,
            })).EnsureSuccessStatusCode();
        }

        var half = await RangeAsync(client, Day(1), Day(10));

        Assert.Equal(15_000m, half.GetProperty("total_earned").GetDecimal());
    }

    [Fact]
    public async Task A_day_that_was_only_planned_earns_nothing()
    {
        // The meal deduction reached days nobody had worked, and a day with a
        // plan on it came back at minus eighty.
        var (client, _) = await api.SignInAsync("planned");
        var shift = await ShiftAsync(client, "План", "hour", 200m);

        (await SaveAsync(client, Day(9), new
        {
            shifts = new[] { Placed(shift, worked: false) },
            sales = Array.Empty<object>(),
            tips = (decimal?)null,
            tips_cash = (decimal?)null,
            deductions = 0m,
            deduction_reason = (string?)null,
            note = (string?)null,
        })).EnsureSuccessStatusCode();

        var range = await RangeAsync(client, Day(1), Day(31));

        Assert.Equal(0m, range.GetProperty("total_earned").GetDecimal());
        Assert.True(range.GetProperty("planned_earned").GetDecimal() > 0m);
    }

    [Fact]
    public async Task Saving_a_day_twice_does_not_reprice_it()
    {
        // A placement holds a snapshot of the terms. Re-saving the day used to
        // delete and rebuild it from the current template, so opening an old
        // day to add a note repriced the work.
        var (client, _) = await api.SignInAsync("reprice");
        var shift = await ShiftAsync(client, "Ставка", "hour", 100m);

        object body(string? note) => new
        {
            shifts = new[] { Placed(shift) },
            sales = Array.Empty<object>(),
            tips = (decimal?)null,
            tips_cash = (decimal?)null,
            deductions = 0m,
            deduction_reason = (string?)null,
            note,
        };

        (await SaveAsync(client, Day(3), body(null))).EnsureSuccessStatusCode();

        // The template is repriced, as it would be by a rise.
        (await client.PutAsJsonAsync(
            $"/shifter/v1/shifts/{shift}",
            new
            {
                name = "Ставка",
                symbol = (string?)null,
                location_id = (int?)null,
                start_time = "10:00",
                end_time = "18:00",
                salary_period = "hour",
                salary_amount = 150m,
                break_minutes = 0,
            })).EnsureSuccessStatusCode();

        (await SaveAsync(client, Day(3), body("дописал заметку"))).EnsureSuccessStatusCode();

        var range = await RangeAsync(client, Day(1), Day(31));

        // Eight hours at the hundred that was agreed, not the hundred and fifty
        // agreed afterwards.
        Assert.Equal(800m, range.GetProperty("total_earned").GetDecimal());
    }

    [Fact]
    public async Task Nobody_can_read_anybody_else_s_month()
    {
        var (mine, _) = await api.SignInAsync("mine");
        var (theirs, _) = await api.SignInAsync("theirs");

        var shift = await ShiftAsync(mine, "Мой", "hour", 500m);

        (await SaveAsync(mine, Day(4), new
        {
            shifts = new[] { Placed(shift) },
            sales = Array.Empty<object>(),
            tips = 1_000m,
            tips_cash = (decimal?)null,
            deductions = 0m,
            deduction_reason = (string?)null,
            note = (string?)null,
        })).EnsureSuccessStatusCode();

        var seen = await RangeAsync(theirs, Day(1), Day(31));

        Assert.Equal(0m, seen.GetProperty("total_earned").GetDecimal());
        Assert.Empty(await Read(await theirs.GetAsync("/shifter/v1/shifts")).ContinueWith(
            task => task.Result.EnumerateArray().ToArray()));
    }

    [Fact]
    public async Task An_unsigned_request_is_refused()
    {
        var stranger = api.CreateClient();

        var response = await stranger.GetAsync($"/shifter/v1/days?from={Day(1)}&to={Day(31)}");

        Assert.Equal(System.Net.HttpStatusCode.Unauthorized, response.StatusCode);
    }
}
