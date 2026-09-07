using System.Net.Http.Json;
using System.Text.Json;

using Xunit;

namespace Shifter.Api.Tests;

/// <summary>
/// The card a stranger opens.
///
/// It is the only page here with no client in front of it: nothing tells it
/// which language to speak, and for a while it did not ask — an application
/// that writes three languages handed a Ukrainian worker a Russian-only page
/// to give an employer. It asks the reader now, who is the person the page
/// exists for.
/// </summary>
[Collection("api")]
public sealed class PublicCardOverHttpTests(Api api)
{
    private async Task<string> PublishAsync(HttpClient client)
    {
        var response = await client.PutAsJsonAsync(
            "/shifter/v1/account/card",
            new { on = true, show_places = true, show_money = false },
            TestContext.Current.CancellationToken);

        response.EnsureSuccessStatusCode();

        var body = await response.Content.ReadFromJsonAsync<JsonElement>(
            TestContext.Current.CancellationToken);

        return body.GetProperty("slug").GetString()!;
    }

    private static async Task<string> ReadAsync(HttpClient client, string slug, string language)
    {
        using var request = new HttpRequestMessage(HttpMethod.Get, $"/c/{slug}");

        request.Headers.Add("Accept-Language", language);

        var response = await client.SendAsync(request, TestContext.Current.CancellationToken);

        response.EnsureSuccessStatusCode();

        return await response.Content.ReadAsStringAsync(TestContext.Current.CancellationToken);
    }

    [Fact]
    public async Task A_ukrainian_reader_is_not_handed_a_russian_page()
    {
        var (client, _) = await api.SignInAsync("cardlang");
        var slug = await PublishAsync(client);

        var uk = await ReadAsync(client, slug, "uk-UA,uk;q=0.9");

        Assert.Contains("<html lang=\"uk\"", uk);
        Assert.Contains("Пораховано за записаними змінами", uk);
        Assert.DoesNotContain("Посчитано по записанным сменам", uk);
    }

    [Fact]
    public async Task Anybody_else_gets_the_language_the_app_was_written_in()
    {
        var (client, _) = await api.SignInAsync("cardru");
        var slug = await PublishAsync(client);

        foreach (var asked in new[] { "ru-RU,ru;q=0.9", "en-GB,en;q=0.9", "" })
        {
            var page = await ReadAsync(client, slug, asked);

            Assert.Contains("<html lang=\"ru\"", page);
            Assert.Contains("Посчитано по записанным сменам", page);
        }
    }

    /// <summary>
    /// The board's own public page is the card's sibling and had the same
    /// gap. A crawler is usually the first reader, and it carries whatever
    /// the sharer's browser sent.
    /// </summary>
    [Fact]
    public async Task The_shared_listing_answers_in_the_readers_language()
    {
        var (client, _) = await api.SignInAsync("giglang");

        var posted = await client.PostAsJsonAsync(
            "/shifter/v1/gigs",
            new
            {
                venue = "Бар «Ніч»",
                category = "bartender",
                employment = "freelance",
                title = "Бармен",
                city = "Київ",
                date = "2026-12-05",
                start = "18:00",
                end = "23:00",
                pay_amount = 900,
                pay_period = "shift",
                slots = 1,
                photos = new[] { Pixel, Pixel, Pixel },
            },
            TestContext.Current.CancellationToken);

        posted.EnsureSuccessStatusCode();

        var gig = await posted.Content.ReadFromJsonAsync<JsonElement>(
            TestContext.Current.CancellationToken);
        var slug = gig.GetProperty("share_slug").GetString()!;

        using var request = new HttpRequestMessage(HttpMethod.Get, $"/g/{slug}");

        request.Headers.Add("Accept-Language", "uk-UA,uk;q=0.9");

        var page = await (await client.SendAsync(request, TestContext.Current.CancellationToken))
            .Content.ReadAsStringAsync(TestContext.Current.CancellationToken);

        Assert.Contains("<html lang=\"uk\">", page);
        Assert.Contains("разова зміна", page);
        Assert.Contains("бармен", page);
        Assert.DoesNotContain("разовая смена", page);
    }

    /// <summary>A JPEG frame header saying 320×320 — the board wants photos.</summary>
    private const string Pixel = "data:image/jpeg;base64,/9j/wAARCAFAAUADASIAAhEBAxEB/9k=";

    /// <summary>
    /// Switching the card off has to take the page with it — a link handed out
    /// once and revoked later is the whole point of the switch.
    /// </summary>
    [Fact]
    public async Task A_card_switched_off_stops_answering()
    {
        var (client, _) = await api.SignInAsync("cardoff");
        var slug = await PublishAsync(client);

        await ReadAsync(client, slug, "ru");

        var off = await client.PutAsJsonAsync(
            "/shifter/v1/account/card",
            new { on = false, show_places = false, show_money = false },
            TestContext.Current.CancellationToken);

        off.EnsureSuccessStatusCode();

        // It answers by sending the reader to the front door rather than by
        // saying «this card is gone» — which would confirm to a stranger that
        // it had been there. What matters is that the record is no longer on
        // the other end of the link.
        var gone = await ReadAsync(client, slug, "ru");

        Assert.DoesNotContain("Посчитано по записанным сменам", gone);
    }
}
