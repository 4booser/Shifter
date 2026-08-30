using System.Net.Http.Json;
using System.Text.Json;

using Xunit;

namespace Shifter.Api.Tests;

/// <summary>
/// One payday for everybody. The brief's facts used to answer "when the pay
/// period closes" while the blocks answered "when the money lands" — and the
/// chart drew its amber tick from the first under a legend about the second.
/// The invariant: facts agree with the payouts page, to the day and to the
/// hryvnia.
/// </summary>
[Collection("api")]
public sealed class PaydayAgreementOverHttpTests
{
    private readonly Api _api;

    public PaydayAgreementOverHttpTests(Api api)
    {
        _api = api;
    }

    private static async Task<JsonElement> Read(HttpResponseMessage response)
    {
        var body = await response.Content.ReadAsStringAsync();

        Assert.True(response.IsSuccessStatusCode, body);

        return JsonDocument.Parse(body).RootElement.Clone();
    }

    [Fact]
    public async Task The_facts_and_the_payouts_page_name_the_same_day_and_figure()
    {
        var signed = await _api.SignInAsync("payday");
        var today = DateOnly.FromDateTime(DateTime.Today);

        // Monthly period, paid on the 10th of the next month: the due date
        // deliberately falls later than the period's own close — exactly the
        // gap the two old answers disagreed across.
        var place = await Read(await signed.Client.PostAsJsonAsync(
            "/shifter/v1/locations",
            new
            {
                name = "Задержливый бар",
                address = (string?)null,
                colour = "#1F3A5F",
                pay_period = "monthly",
                pay_day = 10,
                pay_anchor = (DateOnly?)null,
                overtime_weekly_hours = 40d,
                overtime_multiplier = 1m,
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

        var shift = await Read(await signed.Client.PostAsJsonAsync(
            "/shifter/v1/shifts",
            new
            {
                name = "Смена",
                symbol = (string?)null,
                location_id = place.GetProperty("id").GetInt32(),
                start_time = "10:00",
                end_time = "18:00",
                salary_period = "hour",
                salary_amount = 100m,
                break_minutes = 0,
                colour = (string?)null,
                revenue_percent = (decimal?)null,
                tip_source = "personal",
                tip_pool_percent = (decimal?)null,
            }));

        var worked = await signed.Client.PutAsJsonAsync(
            $"/shifter/v1/days/{today:yyyy-MM-dd}",
            new
            {
                shifts = new[]
                {
                    new
                    {
                        shift_id = shift.GetProperty("id").GetInt32(),
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
                tip_pool = (decimal?)null,
                deductions = (decimal?)null,
                deduction_reason = (string?)null,
                note = (string?)null,
            });

        Assert.True(worked.IsSuccessStatusCode, await worked.Content.ReadAsStringAsync());

        var schedule = await Read(await signed.Client.GetAsync(
            $"/shifter/v1/payouts/schedule?from={today.AddDays(-45):yyyy-MM-dd}&to={today.AddDays(60):yyyy-MM-dd}"));

        var due = schedule.GetProperty("periods").EnumerateArray()
            .Where(row => row.GetProperty("settled").ValueKind == JsonValueKind.Null
                          && DateOnly.Parse(row.GetProperty("due_on").GetString()!) >= today
                          && row.GetProperty("expected").GetDecimal() > 0m)
            .OrderBy(row => row.GetProperty("due_on").GetString())
            .First();

        var facts = await Read(await signed.Client.GetAsync(
            $"/shifter/v1/brief/facts?date={today:yyyy-MM-dd}"));

        var expectedDays = DateOnly.Parse(due.GetProperty("due_on").GetString()!).DayNumber - today.DayNumber;

        Assert.Equal(expectedDays, facts.GetProperty("daysToPayday").GetInt32());
        Assert.Equal(due.GetProperty("expected").GetDecimal(), facts.GetProperty("paydayAmount").GetDecimal());

        // And the gap is the interesting one: the money lands later than the
        // period closes, or this test is not testing the disagreement.
        Assert.True(expectedDays > 0);
    }
}
