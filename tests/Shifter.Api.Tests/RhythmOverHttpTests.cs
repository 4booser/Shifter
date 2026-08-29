using System.Net;
using System.Net.Http.Json;
using System.Text.Json;

using Xunit;

namespace Shifter.Api.Tests;

/// <summary>
/// The rhythm endpoints over real HTTP: the sleep windows between shifts,
/// the fatigue comparison's silence-first sufficiency, and the streak said
/// out loud in the brief.
/// </summary>
[Collection("api")]
public sealed class RhythmOverHttpTests(Api api)
{
    private static async Task<JsonElement> Read(HttpResponseMessage response)
    {
        response.EnsureSuccessStatusCode();

        return JsonDocument.Parse(await response.Content.ReadAsStringAsync()).RootElement;
    }

    private static async Task<int> ShiftAsync(
        HttpClient client, string name, string start, string end)
    {
        var response = await client.PostAsJsonAsync("/shifter/v1/shifts", new
        {
            name,
            symbol = (string?)null,
            location_id = (int?)null,
            start_time = start,
            end_time = end,
            salary_period = "hour",
            salary_amount = 150m,
            break_minutes = 0,
        });

        return (await Read(response)).GetProperty("id").GetInt32();
    }

    private static Task<HttpResponseMessage> WorkAsync(
        HttpClient client, string date, int shiftId, decimal? tips = null)
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
            deductions = 0m,
            deduction_reason = (string?)null,
            note = (string?)null,
        });

    [Fact]
    public async Task A_close_then_open_is_measured_as_the_night_it_actually_was()
    {
        var (client, _) = await api.SignInAsync("rest");

        // Closes at 02:00, back at 10:00 the same morning: an eight-hour
        // window against the default eleven-hour threshold.
        var closing = await ShiftAsync(client, "Закрытие", "18:00", "02:00");
        var opening = await ShiftAsync(client, "Открытие", "10:00", "18:00");

        (await WorkAsync(client, "2026-05-04", closing)).EnsureSuccessStatusCode();
        (await WorkAsync(client, "2026-05-05", opening)).EnsureSuccessStatusCode();

        var read = await Read(await client.GetAsync("/shifter/v1/rhythm/rest?from=2026-05-01&to=2026-05-31"));

        Assert.Equal(11d, read.GetProperty("threshold").GetDouble());
        Assert.Equal(1, read.GetProperty("short_count").GetInt32());
        Assert.Equal(8d, read.GetProperty("shortest").GetDouble());

        var window = read.GetProperty("windows").EnumerateArray().Single();

        // The shift crossed midnight, so the window runs from 02:00 on the
        // 5th — not from 02:00 on the 4th, which would be a 32-hour lie.
        Assert.Equal("2026-05-05T02:00", window.GetProperty("ended").GetString());
        Assert.Equal("2026-05-05T10:00", window.GetProperty("resumed").GetString());
        Assert.True(window.GetProperty("short").GetBoolean());
    }

    [Fact]
    public async Task A_day_off_is_not_a_sleep_window()
    {
        var (client, _) = await api.SignInAsync("dayoff");
        var shift = await ShiftAsync(client, "Смена", "10:00", "18:00");

        // Monday and Wednesday: the 40-hour gap is a day off, not a night.
        (await WorkAsync(client, "2026-05-04", shift)).EnsureSuccessStatusCode();
        (await WorkAsync(client, "2026-05-06", shift)).EnsureSuccessStatusCode();

        var read = await Read(await client.GetAsync("/shifter/v1/rhythm/rest?from=2026-05-01&to=2026-05-31"));

        Assert.Empty(read.GetProperty("windows").EnumerateArray());
        Assert.Equal(0, read.GetProperty("short_count").GetInt32());
        Assert.Equal(JsonValueKind.Null, read.GetProperty("shortest").ValueKind);
    }

    [Fact]
    public async Task Too_little_history_answers_no_content_not_zeros()
    {
        var (client, _) = await api.SignInAsync("fresh");
        var shift = await ShiftAsync(client, "Смена", "10:00", "18:00");

        (await WorkAsync(client, "2026-05-04", shift, 200m)).EnsureSuccessStatusCode();

        var response = await client.GetAsync("/shifter/v1/rhythm/fatigue");

        Assert.Equal(HttpStatusCode.NoContent, response.StatusCode);
    }

    [Fact]
    public async Task Deep_days_of_long_runs_are_compared_against_fresh_ones()
    {
        var (client, _) = await api.SignInAsync("fatigue");
        var shift = await ShiftAsync(client, "Смена", "10:00", "18:00");

        var start = DateOnly.FromDateTime(DateTime.UtcNow).AddDays(-200);

        // Four seven-day runs, ten days apart: tips 200 while fresh, 160 by
        // days six and seven. Fresh days 1-2 of each run: eight of them at
        // 25/h; deep days: eight at 20/h.
        for (var run = 0; run < 4; run++)
        {
            var first = start.AddDays(run * 10);

            for (var offset = 0; offset < 7; offset++)
            {
                (await WorkAsync(
                    client,
                    first.AddDays(offset).ToString("yyyy-MM-dd"),
                    shift,
                    offset >= 5 ? 160m : 200m)).EnsureSuccessStatusCode();
            }
        }

        var verdict = await Read(await client.GetAsync("/shifter/v1/rhythm/fatigue"));

        Assert.Equal(8, verdict.GetProperty("fresh_days").GetInt32());
        Assert.Equal(8, verdict.GetProperty("deep_days").GetInt32());
        Assert.Equal(25m, verdict.GetProperty("fresh_per_hour").GetDecimal());
        Assert.Equal(20m, verdict.GetProperty("deep_per_hour").GetDecimal());
        Assert.Equal(-20, verdict.GetProperty("percent").GetInt32());
        Assert.True(verdict.GetProperty("noticeable").GetBoolean());
    }

    [Fact]
    public async Task A_long_streak_is_said_in_the_brief_as_a_number_not_advice()
    {
        var (client, _) = await api.SignInAsync("streak");
        var shift = await ShiftAsync(client, "Смена", "10:00", "18:00");

        var today = DateOnly.FromDateTime(DateTime.UtcNow);

        for (var back = 6; back >= 0; back--)
        {
            (await WorkAsync(
                client, today.AddDays(-back).ToString("yyyy-MM-dd"), shift)).EnsureSuccessStatusCode();
        }

        var blocks = await client.GetStringAsync(
            $"/shifter/v1/brief/blocks?date={today:yyyy-MM-dd}&lang=ru");

        Assert.Contains("день подряд", blocks);
        Assert.Contains("Седьмой", blocks);

        // The tone rule, enforced: a constatation, never a prescription.
        Assert.DoesNotContain("стоит", blocks.Split("день подряд")[1][..80]);
    }
}
