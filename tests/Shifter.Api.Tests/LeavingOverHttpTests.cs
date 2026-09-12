using System.Net;
using System.Net.Http.Json;
using System.Text.Json;

using Xunit;

namespace Shifter.Api.Tests;

/// <summary>
/// Leaving: deleting a place, and deleting an account.
///
/// Both are the last thing a person does, so both are the least exercised
/// paths in the application — and both answered 500 for ordinary histories.
/// What happens to a child row when its parent goes was written down in one
/// place (gigs) and left to chance everywhere else: a break held its shift
/// hostage, and a payout or an expense rule held its place hostage, because
/// the handler detached only shifts and nothing checked the rest.
///
/// These ask over HTTP, because the fault was in the database's answer and
/// no unit test on a handler can see it.
/// </summary>
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

    /// <summary>
    /// A place somebody has been paid at can still be deleted, and the payment
    /// survives it.
    ///
    /// Money already received is a fact about the past; the place it happened
    /// at is a label on that fact. Deleting the label must not delete the
    /// fact — and must not fail either, which is what it did.
    /// </summary>
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

    /// <summary>
    /// An account whose shifts have breaks can be deleted.
    ///
    /// Every hourly template with an unpaid stretch holds a Break row, which
    /// is to say: almost everybody. The foreign key under it was left at NO
    /// ACTION, so the delete reached the database and the database said no.
    /// </summary>
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
}
