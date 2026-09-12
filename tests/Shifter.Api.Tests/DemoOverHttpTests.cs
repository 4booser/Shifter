using System.Net;
using System.Net.Http.Json;
using System.Text.Json;

using Xunit;

namespace Shifter.Api.Tests;

/// <summary>
/// «Посмотреть на примере», asked of the running server.
///
/// The demonstration account is the only screen in this application a
/// stranger can reach without typing a month of their own work in first, and
/// the thing that makes it worth anything is that the numbers on it are
/// worked out by the same code that works out everybody else's. So this asks
/// for one and then reads what the calendar reads.
/// </summary>
[Collection("api")]
public sealed class DemoOverHttpTests(Api api)
{
    private static async Task<JsonElement> Read(HttpResponseMessage response)
    {
        var body = await response.Content.ReadAsStringAsync();

        Assert.True(
            response.IsSuccessStatusCode,
            $"{(int)response.StatusCode} {response.RequestMessage?.RequestUri}: {body}");

        return JsonDocument.Parse(body).RootElement.Clone();
    }

    /// <summary>
    /// A visitor with no account gets a signed-in one with work already in it.
    /// </summary>
    [Fact]
    public async Task An_example_account_arrives_with_a_half_year_of_work_in_it()
    {
        var client = api.CreateClient();

        var started = await Read(await client.PostAsync("/shifter/v1/demo", null));

        var token = started.GetProperty("access_token").GetString();

        Assert.False(string.IsNullOrWhiteSpace(token));

        client.DefaultRequestHeaders.Authorization =
            new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", token);

        // It says what it is. Every screen has to be able to tell somebody
        // they are looking at an example before they spend an evening on it.
        var profile = await Read(await client.GetAsync("/shifter/v1/account"));

        Assert.True(profile.GetProperty("is_demo").GetBoolean());
        Assert.StartsWith("demo-", profile.GetProperty("login").GetString());

        var places = await Read(await client.GetAsync("/shifter/v1/locations?archived=true"));
        var shifts = await Read(await client.GetAsync("/shifter/v1/shifts?archived=true"));

        Assert.Equal(2, places.GetArrayLength());
        Assert.Equal(3, shifts.GetArrayLength());

        // The month on the screen, counted by the server's own arithmetic —
        // which is the whole reason this is seeded here and not invented in
        // the browser.
        var today = new Shifter.Application.Common.Time.AppClock().Today;
        var from = new DateOnly(today.Year, today.Month, 1).AddMonths(-1);
        var to = from.AddMonths(2);

        var days = await Read(await client.GetAsync(
            $"/shifter/v1/days?from={from:yyyy-MM-dd}&to={to:yyyy-MM-dd}"));

        Assert.True(days.GetProperty("days_worked").GetInt32() > 10);
        Assert.True(days.GetProperty("hours").GetDouble() > 100);
        Assert.True(days.GetProperty("total_earned").GetDecimal() > 10_000);

        // Days ahead of today are a plan, not a record: a calendar where
        // everything is already worked has nothing to show about next week.
        Assert.True(days.GetProperty("days_planned").GetInt32() > 0);

        var payouts = await Read(await client.GetAsync(
            $"/shifter/v1/payouts?from={from.AddMonths(-8):yyyy-MM-dd}&to={to:yyyy-MM-dd}"));

        Assert.True(payouts.GetArrayLength() > 5);
    }

    /// <summary>
    /// Two visitors are looking at the same example, not at each other's.
    ///
    /// A shared account would show the last stranger's typing to the next
    /// one; a per-visitor one must not leak either way.
    /// </summary>
    [Fact]
    public async Task Two_visitors_get_their_own_copies()
    {
        var one = api.CreateClient();
        var two = api.CreateClient();

        var first = await Read(await one.PostAsync("/shifter/v1/demo", null));
        var second = await Read(await two.PostAsync("/shifter/v1/demo", null));

        Assert.NotEqual(
            first.GetProperty("access_token").GetString(),
            second.GetProperty("access_token").GetString());

        one.DefaultRequestHeaders.Authorization =
            new System.Net.Http.Headers.AuthenticationHeaderValue(
                "Bearer", first.GetProperty("access_token").GetString());
        two.DefaultRequestHeaders.Authorization =
            new System.Net.Http.Headers.AuthenticationHeaderValue(
                "Bearer", second.GetProperty("access_token").GetString());

        var mine = await Read(await one.GetAsync("/shifter/v1/account"));
        var theirs = await Read(await two.GetAsync("/shifter/v1/account"));

        Assert.NotEqual(
            mine.GetProperty("id").GetInt32(),
            theirs.GetProperty("id").GetInt32());
    }
}
