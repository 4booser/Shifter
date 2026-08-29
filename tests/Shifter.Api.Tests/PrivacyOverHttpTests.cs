using System.Net.Http.Json;
using System.Text.Json;

using Xunit;

namespace Shifter.Api.Tests;

/// <summary>
/// What one person can see of another, asked of the running server.
///
/// The unit tests here pin a list of field names in a DTO. That is worth
/// having and it is not the same question: what matters is what comes back
/// over the wire to a second account, and nothing has ever asked.
///
/// A crew's rates are the most sensitive thing this application holds about
/// anybody other than the person holding the phone.
/// </summary>
[Collection("api")]
public sealed class PrivacyOverHttpTests(Api api)
{
    private static string Day(int day) => $"2026-05-{day:00}";

    /// <summary>
    /// One pixel of JPEG, because the board wants three photos of the venue
    /// and will only take JPEGs the client has already shrunk.
    /// </summary>
    private const string Pixel = "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==";

    private static async Task<JsonElement> Read(HttpResponseMessage response)
    {
        var body = await response.Content.ReadAsStringAsync();

        Assert.True(
            response.IsSuccessStatusCode,
            $"{(int)response.StatusCode} {response.RequestMessage?.RequestUri}: {body}");

        return JsonDocument.Parse(body).RootElement.Clone();
    }

    /// <summary>An owner, a joiner, and a day of paid work on the joiner's calendar.</summary>
    private async Task<(HttpClient Owner, HttpClient Crew, int Team)> CrewAsync(
        bool shareEarnings)
    {
        var (owner, _) = await api.SignInAsync("owner");
        var (crew, _) = await api.SignInAsync("crew");

        var team = await Read(await owner.PostAsJsonAsync(
            "/shifter/v1/teams", new { name = "Бар на углу" }));

        var id = team.GetProperty("id").GetInt32();
        var code = team.GetProperty("invite_code").GetString();

        (await crew.PostAsJsonAsync(
            "/shifter/v1/teams/join",
            new { invite_code = code, display_name = "Оля" })).EnsureSuccessStatusCode();

        (await crew.PatchAsJsonAsync(
            $"/shifter/v1/teams/{id}/me",
            new
            {
                display_name = "Оля",
                colour = "#1F3A5F",
                share_earnings = shareEarnings,
                private_by_default = false,
                trainee = false,
                trial_ends_on = (DateOnly?)null,
            })).EnsureSuccessStatusCode();

        var shift = await Read(await crew.PostAsJsonAsync(
            "/shifter/v1/shifts",
            new
            {
                name = "Вечер",
                symbol = (string?)null,
                location_id = (int?)null,
                start_time = "18:00",
                end_time = "02:00",
                salary_period = "hour",
                salary_amount = 250m,
                break_minutes = 0,
            }));

        (await crew.PutAsJsonAsync($"/shifter/v1/days/{Day(6)}", new
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
            tips = 900m,
            tips_cash = (decimal?)null,
            deductions = 0m,
            deduction_reason = (string?)null,
            note = "мой личный текст",
        })).EnsureSuccessStatusCode();

        return (owner, crew, id);
    }

    private static async Task<JsonElement> RotaAsync(HttpClient client, int team)
        => await Read(await client.GetAsync(
            $"/shifter/v1/teams/{team}/rota?from={Day(1)}&to={Day(31)}"));

    [Fact]
    public async Task A_crew_mate_who_does_not_share_sends_no_pay_over_the_wire()
    {
        var (owner, _, team) = await CrewAsync(shareEarnings: false);

        var rota = await RotaAsync(owner, team);

        var entries = rota.GetProperty("entries").EnumerateArray().ToArray();

        Assert.NotEmpty(entries);

        // Null, and not a filtered zero: the query never selects the column
        // for somebody who has not opted in, so there is nothing in memory to
        // leak in the first place.
        foreach (var entry in entries)
            Assert.Equal(JsonValueKind.Null, entry.GetProperty("pay").ValueKind);

        foreach (var member in rota.GetProperty("members").EnumerateArray())
        {
            if (member.GetProperty("is_you").GetBoolean()) continue;

            Assert.Equal(JsonValueKind.Null, member.GetProperty("earned").ValueKind);
        }
    }

    [Fact]
    public async Task The_rota_never_carries_a_note_a_tip_or_a_rate()
    {
        // Anything added to the rota record becomes visible to a whole crew.
        // The day behind it holds a private note, tips and a rate; none of the
        // three has any business travelling.
        var (owner, _, team) = await CrewAsync(shareEarnings: true);

        var raw = await (await owner.GetAsync(
            $"/shifter/v1/teams/{team}/rota?from={Day(1)}&to={Day(31)}")).Content.ReadAsStringAsync();

        Assert.DoesNotContain("мой личный текст", raw);
        Assert.DoesNotContain("900", raw);
        Assert.DoesNotContain("tips", raw);
    }

    [Fact]
    public async Task A_stranger_cannot_read_a_rota_they_do_not_belong_to()
    {
        var (_, _, team) = await CrewAsync(shareEarnings: true);
        var (stranger, _) = await api.SignInAsync("stranger");

        var response = await stranger.GetAsync(
            $"/shifter/v1/teams/{team}/rota?from={Day(1)}&to={Day(31)}");

        Assert.False(response.IsSuccessStatusCode);
    }

    [Fact]
    public async Task Somebody_who_shares_still_sees_their_own_figures()
    {
        // A rota that hid your own totals from you would be a strange thing to
        // open, and the sharing set includes you whether or not you share.
        var (_, crew, team) = await CrewAsync(shareEarnings: false);

        var rota = await RotaAsync(crew, team);

        var me = rota.GetProperty("members").EnumerateArray()
            .Single(member => member.GetProperty("is_you").GetBoolean());

        Assert.NotEqual(JsonValueKind.Null, me.GetProperty("earned").ValueKind);
    }

    [Fact]
    public async Task A_gig_reply_carries_no_contacts_until_they_are_opened()
    {
        var (venue, _) = await api.SignInAsync("venue");
        var (worker, _) = await api.SignInAsync("worker");

        var gig = await Read(await venue.PostAsJsonAsync("/shifter/v1/gigs", new
        {
            venue = "Бар на углу",
            category = "bartender",
            employment = "freelance",
            // The board insists on three, so a listing cannot be a line of
            // text with a phone number in it.
            photos = new[] { Pixel, Pixel, Pixel },
            schedule = (string?)null,
            title = "Бармен на закрытие",
            details = (string?)null,
            date = Day(20),
            start = "18:00",
            end = "02:00",
            pay_amount = 300m,
            pay_period = "hour",
            pay_percent = (decimal?)null,
            city = "Киев",
            slots = 1,
            urgent = false,
        }));

        var id = gig.GetProperty("id").GetInt32();

        // A quiet reply: asking about the shift, not applying for it.
        (await worker.PostAsJsonAsync($"/shifter/v1/gigs/{id}/respond", new
        {
            message = "Свободен",
            phone = "+380501234567",
            telegram = "@somebody",
            quiet = true,
        })).EnsureSuccessStatusCode();

        var mine = await (await venue.GetAsync("/shifter/v1/gigs/mine")).Content.ReadAsStringAsync();

        // The number was typed and then held back. It never left.
        Assert.DoesNotContain("380501234567", mine);
        Assert.DoesNotContain("@somebody", mine);
    }
}
