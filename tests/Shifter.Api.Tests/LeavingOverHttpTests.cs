using System.Net;
using System.Net.Http.Json;
using System.Text.Json;

using Xunit;

namespace Shifter.Api.Tests;

/// <summary>Leaving: deleting a place, and deleting an account.</summary>
[Collection("api")]
public sealed class LeavingOverHttpTests(Api api)
{
    private static async Task<JsonElement> Read(HttpResponseMessage response)
    {
        var body = await response.Content.ReadAsStringAsync();

        Assert.True(
            response.IsSuccessStatusCode,
            $"{(int)response.StatusCode} {response.RequestMessage?.RequestUri}: {body}");

        return JsonDocument.Parse(body).RootElement.Clone();
    }

    private static async Task<int> PlaceAsync(HttpClient client, string name)
    {
        var place = await Read(await client.PostAsJsonAsync("/shifter/v1/locations", new
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
        }));

        return place.GetProperty("id").GetInt32();
    }

    /// <summary>A place somebody has been paid at can still be deleted, and the payment survives it.</summary>
    [Fact]
    public async Task A_place_that_has_paid_you_can_still_be_deleted()
    {
        var (client, _) = await api.SignInAsync("leave");

        var place = await PlaceAsync(client, "Бар, которого не станет");

        var payout = await Read(await client.PostAsJsonAsync("/shifter/v1/payouts", new
        {
            period_from = new DateOnly(2026, 4, 1),
            period_to = new DateOnly(2026, 4, 30),
            amount = 18_400m,
            received_on = new DateOnly(2026, 5, 10),
            note = "апрель",
            location_id = place,
        }));

        var id = payout.GetProperty("id").GetInt32();

        var gone = await client.DeleteAsync($"/shifter/v1/locations/{place}?detach=true");

        Assert.Equal(HttpStatusCode.NoContent, gone.StatusCode);

        var payouts = await Read(await client.GetAsync(
            "/shifter/v1/payouts?from=2026-04-01&to=2026-05-31"));

        var kept = payouts.EnumerateArray()
            .SingleOrDefault(row => row.GetProperty("id").GetInt32() == id);

        Assert.Equal(JsonValueKind.Object, kept.ValueKind);
        Assert.Equal(18_400m, kept.GetProperty("amount").GetDecimal());
    }

    /// <summary>An account whose shifts have breaks can be deleted.</summary>
    [Fact]
    public async Task An_account_with_a_break_on_a_shift_can_be_deleted()
    {
        var (client, login) = await api.SignInAsync("leave");

        var place = await PlaceAsync(client, "Смена с перерывом");

        (await client.PostAsJsonAsync("/shifter/v1/shifts", new
        {
            name = "Вечер",
            symbol = (string?)null,
            location_id = place,
            start_time = "16:00",
            end_time = "00:00",
            salary_period = "hour",
            salary_amount = 180m,
            // The whole point: thirty unpaid minutes is one Break row.
            break_minutes = 30,
        })).EnsureSuccessStatusCode();

        var request = new HttpRequestMessage(HttpMethod.Delete, "/shifter/v1/account")
        {
            Content = JsonContent.Create(new
            {
                password = "Integration1@x",
                confirm_login = login,
            }),
        };

        var gone = await client.SendAsync(request);

        Assert.Equal(HttpStatusCode.NoContent, gone.StatusCode);
    }

    /// <summary>The names on a roster are the owner's data and have no account of their own to stay behind in.</summary>
    [Fact]
    public async Task Leaving_takes_a_roster_and_every_name_on_it()
    {
        var (client, login) = await api.SignInAsync("leave");

        var roster = await Read(await client.PostAsJsonAsync("/shifter/v1/rosters", new { title = "Кальянная" }));
        var id = roster.GetProperty("id").GetInt32();

        var person = await Read(await client.PostAsJsonAsync(
            $"/shifter/v1/rosters/{id}/people",
            new { name = "Толик", position = "Кальяны", colour = "#1f3a5f" }));

        (await client.PutAsJsonAsync($"/shifter/v1/rosters/{id}/cells", new
        {
            set = new[]
            {
                new
                {
                    person_id = person.GetProperty("id").GetInt32(),
                    date = "2026-11-02",
                    start_time = "11:00",
                    end_time = "22:00",
                },
            },
        })).EnsureSuccessStatusCode();

        var slug = (await Read(await client.PostAsync($"/shifter/v1/rosters/{id}/share", null)))
            .GetProperty("share_slug").GetString();

        var request = new HttpRequestMessage(HttpMethod.Delete, "/shifter/v1/account")
        {
            Content = JsonContent.Create(new
            {
                password = "Integration1@x",
                confirm_login = login,
            }),
        };

        var gone = await client.SendAsync(request);

        Assert.Equal(HttpStatusCode.NoContent, gone.StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await api.CreateClient().GetAsync($"/r/{slug}")).StatusCode);
    }
}
