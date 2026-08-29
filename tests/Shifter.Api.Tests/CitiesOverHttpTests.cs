using System.Net.Http.Json;
using System.Text.Json;

using Xunit;

namespace Shifter.Api.Tests;

/// <summary>
/// «Где мой час дороже»: the seasonal worker's own history, city by city,
/// with the market band only where the sample clears the anonymity bar.
/// </summary>
[Collection("api")]
public sealed class CitiesOverHttpTests(Api api)
{
    private const string Pixel = "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==";

    private static async Task<JsonElement> Read(HttpResponseMessage response)
    {
        response.EnsureSuccessStatusCode();

        return JsonDocument.Parse(await response.Content.ReadAsStringAsync()).RootElement;
    }

    private static async Task<int> PlaceAsync(HttpClient client, string name, string city)
    {
        var response = await client.PostAsJsonAsync("/shifter/v1/locations", new
        {
            name,
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
            city,
        });

        return (await Read(response)).GetProperty("id").GetInt32();
    }

    private static async Task<int> ShiftAsync(HttpClient client, string name, int place, decimal rate)
    {
        var response = await client.PostAsJsonAsync("/shifter/v1/shifts", new
        {
            name,
            symbol = (string?)null,
            location_id = place,
            start_time = "10:00",
            end_time = "18:00",
            salary_period = "hour",
            salary_amount = rate,
            break_minutes = 0,
        });

        return (await Read(response)).GetProperty("id").GetInt32();
    }

    private static Task<HttpResponseMessage> WorkAsync(HttpClient client, string date, int shiftId)
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
            tips = (decimal?)null,
            tips_cash = (decimal?)null,
            deductions = 0m,
            deduction_reason = (string?)null,
            note = (string?)null,
        });

    [Fact]
    public async Task Own_cities_are_compared_and_the_market_stays_behind_its_thresholds()
    {
        var (client, _) = await api.SignInAsync("cities");

        // Two summers: Одеса at 200/h, Львів at 160/h.
        var odesa = await PlaceAsync(client, "Бар у моря", "Одеса");
        var lviv = await PlaceAsync(client, "Кав'ярня", "Львів");
        var odesaShift = await ShiftAsync(client, "Море", odesa, 200m);
        var lvivShift = await ShiftAsync(client, "Кава", lviv, 160m);

        (await WorkAsync(client, "2026-06-05", odesaShift)).EnsureSuccessStatusCode();
        (await WorkAsync(client, "2026-06-06", odesaShift)).EnsureSuccessStatusCode();
        (await WorkAsync(client, "2026-03-05", lvivShift)).EnsureSuccessStatusCode();

        // The person says what they work: a bartender. The market column
        // filters to that — a chef's postings must not price a bartender.
        (await client.PutAsJsonAsync("/shifter/v1/gigs/seeker", new
        {
            categories = new[] { "bartender" },
            employment = "freelance",
            city = "Одеса",
            about = (string?)null,
            availability = (string?)null,
            pay_amount = (decimal?)null,
            pay_period = (string?)null,
            phone = (string?)null,
            telegram = (string?)null,
            is_active = false,
        })).EnsureSuccessStatusCode();

        // Two venue accounts post bartender gigs in Одеса — real postings,
        // but two employers is under the five the anonymity floor demands.
        for (var venue = 0; venue < 2; venue++)
        {
            var (poster, _) = await api.SignInAsync($"venue{venue}");

            for (var i = 0; i < 5; i++)
            {
                (await poster.PostAsJsonAsync("/shifter/v1/gigs", new
                {
                    venue = $"Бар {venue}",
                    category = "bartender",
                    employment = "freelance",
                    photos = new[] { Pixel, Pixel, Pixel },
                    schedule = (string?)null,
                    title = "Бармен",
                    details = (string?)null,
                    date = DateOnly.FromDateTime(DateTime.UtcNow).AddDays(7 + i).ToString("yyyy-MM-dd"),
                    start = "18:00",
                    end = "23:00",
                    pay_amount = 180m + venue * 20m,
                    pay_period = "hour",
                    pay_percent = (decimal?)null,
                    city = "Одеса",
                    slots = 1,
                    urgent = false,
                })).EnsureSuccessStatusCode();
            }
        }

        var rows = (await Read(await client.GetAsync("/shifter/v1/gigs/cities")))
            .EnumerateArray().ToArray();

        Assert.Equal(2, rows.Length);

        // Dearest hour first: the question the page answers.
        Assert.Equal("Одеса", rows[0].GetProperty("city").GetString());
        Assert.Equal(200m, rows[0].GetProperty("per_hour").GetDecimal());
        Assert.Equal(16d, rows[0].GetProperty("hours").GetDouble());
        Assert.Equal("Львів", rows[1].GetProperty("city").GetString());
        Assert.Equal(160m, rows[1].GetProperty("per_hour").GetDecimal());

        // Ten postings, but two employers: the market column stays silent
        // rather than publishing a number a reader could pin on one bar.
        Assert.Equal(JsonValueKind.Null, rows[0].GetProperty("market").ValueKind);
    }

    [Fact]
    public async Task A_client_that_never_heard_of_cities_cannot_erase_one()
    {
        var (client, _) = await api.SignInAsync("citykeep");
        var place = await PlaceAsync(client, "Бар", "Харків");

        // An old client saves the place: its JSON has no city field at all.
        (await client.PutAsJsonAsync($"/shifter/v1/locations/{place}", new
        {
            name = "Бар (переименован)",
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
        })).EnsureSuccessStatusCode();

        var places = await Read(await client.GetAsync("/shifter/v1/locations?archived=false"));
        var kept = places.EnumerateArray().Single(row => row.GetProperty("id").GetInt32() == place);

        Assert.Equal("Харків", kept.GetProperty("city").GetString());

        // And the explicit empty string is the explicit «unsay it».
        (await client.PutAsJsonAsync($"/shifter/v1/locations/{place}", new
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
            city = "",
        })).EnsureSuccessStatusCode();

        places = await Read(await client.GetAsync("/shifter/v1/locations?archived=false"));
        kept = places.EnumerateArray().Single(row => row.GetProperty("id").GetInt32() == place);

        Assert.Equal("", kept.GetProperty("city").GetString());
    }
}

