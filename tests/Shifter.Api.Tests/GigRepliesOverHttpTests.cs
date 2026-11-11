using System.Net;
using System.Net.Http.Json;
using System.Text.Json;

using Xunit;

namespace Shifter.Api.Tests;

/// <summary>The list of gigs a person answered, which answered 500 to everybody: its query loaded a reply's gig and that gig's replies, a cycle EF refuses outright in a no-tracking query.</summary>
[Collection("api")]
public sealed class GigRepliesOverHttpTests(Api api)
{
    [Fact]
    public async Task A_person_sees_the_gigs_they_answered()
    {
        var (venue, _) = await api.SignInAsync("venue-replies");
        var (worker, _) = await api.SignInAsync("worker-replies");

        var created = await venue.PostAsJsonAsync("/shifter/v1/gigs", new
        {
            venue = "Бар на углу",
            category = "bartender",
            // Three, as a listing needs; JPEG by their prefix, which is all
            // that is read of a photo too short to say its size.
            photos = Enumerable.Repeat("data:image/jpeg;base64,AAAA", 3).ToArray(),
            title = "Бармен на вечер",
            date = "2026-12-20",
            start = "18:00",
            end = "23:00",
            pay_amount = 30m,
            pay_period = "hour",
            city = "Warszawa",
            slots = 1,
        });
        Assert.True(created.IsSuccessStatusCode, await created.Content.ReadAsStringAsync());

        var gigId = JsonDocument.Parse(await created.Content.ReadAsStringAsync()).RootElement.GetProperty("id").GetInt32();

        (await worker.PostAsJsonAsync($"/shifter/v1/gigs/{gigId}/respond", new { quiet = true })).EnsureSuccessStatusCode();

        var replies = await worker.GetAsync("/shifter/v1/gigs/replies");

        Assert.Equal(HttpStatusCode.OK, replies.StatusCode);

        var gigs = JsonDocument.Parse(await replies.Content.ReadAsStringAsync()).RootElement.EnumerateArray().ToArray();

        Assert.Equal("Бармен на вечер", Assert.Single(gigs).GetProperty("title").GetString());
    }
}
