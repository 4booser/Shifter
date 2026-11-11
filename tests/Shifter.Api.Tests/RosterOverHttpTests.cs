using System.IO.Compression;
using System.Net;
using System.Net.Http.Json;
using System.Text.Json;

using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.TestHost;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

using Shifter.Api.Middlewares;
using Shifter.Application.Common.Time;
using Shifter.Domain.Entities;
using Shifter.Infrastructure.Persistence.DbContexts;

using Xunit;

namespace Shifter.Api.Tests;

/// <summary>A roster: one owner writes it and everybody else reads a link.</summary>
[Collection("api")]
public sealed class RosterOverHttpTests(Api api)
{
    private const string Rosters = "/shifter/v1/rosters";

    /// <summary>A Tuesday in the middle of a month, so the month has days on both sides of today.</summary>
    private static readonly DateTime Tuesday = new(2026, 11, 17, 12, 0, 0, DateTimeKind.Utc);

    private sealed class Stopped(DateTime now) : TimeProvider
    {
        public override DateTimeOffset GetUtcNow() => new(now);
    }

    /// <summary>The application with its clock stopped, on <see cref="Tuesday"/> unless told otherwise.</summary>
    private WebApplicationFactory<Program> StoppedHost(DateTime? at = null) => api.WithWebHostBuilder(
        builder => builder.ConfigureTestServices(
            services => services.AddSingleton(new AppClock(time: new Stopped(at ?? Tuesday)))));

    private static async Task<JsonElement> Read(HttpResponseMessage response)
    {
        var body = await response.Content.ReadAsStringAsync();

        Assert.True(
            response.IsSuccessStatusCode,
            $"{(int)response.StatusCode} {response.RequestMessage?.RequestUri}: {body}");

        return JsonDocument.Parse(body).RootElement.Clone();
    }

    private static async Task<int> RosterAsync(HttpClient client, string title = "Кальянная")
        => (await Read(await client.PostAsJsonAsync(Rosters, new { title })))
            .GetProperty("id").GetInt32();

    private static async Task<int> PersonAsync(
        HttpClient client, int roster, string name = "Толик", string? position = "Кальяны", string colour = "#1f3a5f")
        => (await Read(await client.PostAsJsonAsync($"{Rosters}/{roster}/people", new { name, position, colour })))
            .GetProperty("id").GetInt32();

    private static object Cell(int person, string date, string start = "11:00", string end = "22:00")
        => new { person_id = person, date, start_time = start, end_time = end };

    private static object Empty(int person, string date) => new { person_id = person, date };

    private static Task<HttpResponseMessage> CellsAsync(
        HttpClient client, int roster, object[] set, object[]? clear = null)
        => client.PutAsJsonAsync($"{Rosters}/{roster}/cells", new { set, clear = clear ?? [] });

    private static async Task SetAsync(HttpClient client, int roster, params object[] set)
        => Assert.Equal(HttpStatusCode.NoContent, (await CellsAsync(client, roster, set)).StatusCode);

    private static async Task<JsonElement> MonthAsync(HttpClient client, int roster, string month)
        => await Read(await client.GetAsync($"{Rosters}/{roster}/month/{month}"));

    private static async Task<string> ShareAsync(HttpClient client, int roster)
        => (await Read(await client.PostAsync($"{Rosters}/{roster}/share", null)))
            .GetProperty("share_slug").GetString()!;

    private static async Task<HttpResponseMessage> OpenAsync(HttpClient client, string path, string language = "ru")
    {
        using var request = new HttpRequestMessage(HttpMethod.Get, path);

        request.Headers.Add("Accept-Language", language);

        return await client.SendAsync(request);
    }

    private static async Task<string> PageAsync(HttpClient client, string path, string language = "ru")
    {
        var response = await OpenAsync(client, path, language);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        return await response.Content.ReadAsStringAsync();
    }

    /// <summary>The phone's half of the page.</summary>
    private static string Phone(string page)
    {
        int from = page.IndexOf("<div class=\"days\">", StringComparison.Ordinal);

        Assert.True(from >= 0, "The page has no list.");

        return page[from..page.IndexOf("<footer>", StringComparison.Ordinal)];
    }

    private async Task<T> WithDbAsync<T>(Func<ShifterDbContext, Task<T>> read)
    {
        using var scope = api.Services.CreateScope();

        return await read(scope.ServiceProvider.GetRequiredService<ShifterDbContext>());
    }

    private Task<int> UserIdAsync(string login) => WithDbAsync(
        db => db.Users.Where(user => user.Login == login).Select(user => user.Id).SingleAsync());

    /// <summary>The first roster of whoever this client is signed in as.</summary>
    private static async Task<int> RosterIdAsync(HttpClient client)
        => (await Read(await client.GetAsync(Rosters)))[0].GetProperty("id").GetInt32();

    private static string[] Dates(JsonElement month) => month.GetProperty("shifts").EnumerateArray()
        .Select(shift => shift.GetProperty("date").GetString()!)
        .ToArray();

    // ==== The owner ====

    [Fact]
    public async Task A_roster_lists_with_its_people_and_opens_empty()
    {
        var (client, _) = await api.SignInAsync("rosterlist");

        var made = await Read(await client.PostAsJsonAsync(Rosters, new { title = "  Кальянная  " }));

        Assert.Equal("Кальянная", made.GetProperty("title").GetString());
        Assert.Equal(JsonValueKind.Null, made.GetProperty("share_slug").ValueKind);
        Assert.Equal(0, made.GetProperty("people").GetArrayLength());

        int roster = made.GetProperty("id").GetInt32();
        int person = await PersonAsync(client, roster, " Толик ", "  ", "#1F3A5F");

        var listed = (await Read(await client.GetAsync(Rosters))).EnumerateArray().Single();
        var who = listed.GetProperty("people").EnumerateArray().Single();

        Assert.Equal(person, who.GetProperty("id").GetInt32());
        Assert.Equal("Толик", who.GetProperty("name").GetString());
        Assert.Equal(JsonValueKind.Null, who.GetProperty("position").ValueKind);
        Assert.Equal("#1f3a5f", who.GetProperty("colour").GetString());

        var month = await MonthAsync(client, roster, "2026-11");

        Assert.Equal(roster, month.GetProperty("id").GetInt32());
        Assert.Equal("Кальянная", month.GetProperty("title").GetString());
        Assert.Equal("2026-11", month.GetProperty("month").GetString());
        Assert.Equal(1, month.GetProperty("people").GetArrayLength());
        Assert.Equal(0, month.GetProperty("shifts").GetArrayLength());
    }

    [Fact]
    public async Task A_title_and_a_person_can_be_changed()
    {
        var (client, _) = await api.SignInAsync("rosteredit");
        int roster = await RosterAsync(client);
        int person = await PersonAsync(client, roster);

        var renamed = await Read(await client.PutAsJsonAsync($"{Rosters}/{roster}", new { title = "Бар" }));

        Assert.Equal("Бар", renamed.GetProperty("title").GetString());
        Assert.Equal(1, renamed.GetProperty("people").GetArrayLength());

        var edited = await Read(await client.PutAsJsonAsync(
            $"{Rosters}/{roster}/people/{person}",
            new { name = "Гриша", position = "Бар", colour = "#aabbcc" }));

        Assert.Equal("Гриша", edited.GetProperty("name").GetString());
        Assert.Equal("Бар", edited.GetProperty("position").GetString());
    }

    [Fact]
    public async Task A_cell_is_an_upsert_and_the_last_write_wins()
    {
        var (client, _) = await api.SignInAsync("rosterupsert");
        int roster = await RosterAsync(client);
        int person = await PersonAsync(client, roster);

        await SetAsync(client, roster, Cell(person, "2026-11-02", "11:00", "22:00"));
        await SetAsync(client, roster, Cell(person, "2026-11-02", "12:30", "23:00"));

        var shift = (await MonthAsync(client, roster, "2026-11")).GetProperty("shifts").EnumerateArray().Single();

        Assert.Equal(person, shift.GetProperty("person_id").GetInt32());
        Assert.Equal("2026-11-02", shift.GetProperty("date").GetString());
        Assert.Equal("12:30", shift.GetProperty("start_time").GetString());
        Assert.Equal("23:00", shift.GetProperty("end_time").GetString());

        Assert.Equal(
            HttpStatusCode.NoContent,
            (await CellsAsync(client, roster, [], [Empty(person, "2026-11-02")])).StatusCode);

        Assert.Empty(Dates(await MonthAsync(client, roster, "2026-11")));
    }

    [Fact]
    public async Task A_batch_sets_and_clears_in_one_go()
    {
        var (client, _) = await api.SignInAsync("rosterbatch");
        int roster = await RosterAsync(client);
        int person = await PersonAsync(client, roster);

        await SetAsync(client, roster, Cell(person, "2026-11-02"), Cell(person, "2026-11-03"));

        var both = await CellsAsync(
            client, roster, [Cell(person, "2026-11-04")], [Empty(person, "2026-11-02"), Empty(person, "2026-11-20")]);

        Assert.Equal(HttpStatusCode.NoContent, both.StatusCode);
        Assert.Equal(["2026-11-03", "2026-11-04"], Dates(await MonthAsync(client, roster, "2026-11")));
    }

    [Fact]
    public async Task Two_devices_writing_one_cell_at_once_leave_one_shift_and_no_error()
    {
        var (client, _) = await api.SignInAsync("rosterrace");
        int roster = await RosterAsync(client);
        int person = await PersonAsync(client, roster);

        var writes = await Task.WhenAll(Enumerable.Range(10, 8).Select(hour => CellsAsync(
            client, roster, [Cell(person, "2026-11-02", $"{hour}:00", "23:00")])));

        Assert.All(writes, write => Assert.Equal(HttpStatusCode.NoContent, write.StatusCode));
        Assert.Single(Dates(await MonthAsync(client, roster, "2026-11")));
    }

    [Fact]
    public async Task A_shift_past_midnight_belongs_to_the_date_it_started()
    {
        var (client, _) = await api.SignInAsync("rosternight");
        int roster = await RosterAsync(client);
        int person = await PersonAsync(client, roster);

        await SetAsync(client, roster, Cell(person, "2026-10-31", "22:00", "06:00"));

        Assert.Equal(["2026-10-31"], Dates(await MonthAsync(client, roster, "2026-10")));
        Assert.Empty(Dates(await MonthAsync(client, roster, "2026-11")));
    }

    [Fact]
    public async Task A_month_that_is_not_a_month_is_refused_rather_than_broken_on()
    {
        var (client, _) = await api.SignInAsync("rostermonth");
        int roster = await RosterAsync(client);

        foreach (var month in new[] { "abc", "2026-13", "0001-01", "9999-12" })
        {
            Assert.Equal(
                HttpStatusCode.BadRequest,
                (await client.GetAsync($"{Rosters}/{roster}/month/{month}")).StatusCode);

            Assert.Equal(
                HttpStatusCode.BadRequest,
                (await client.PostAsJsonAsync($"{Rosters}/{roster}/repeat", new { month })).StatusCode);
        }
    }

    [Fact]
    public async Task A_body_that_is_not_what_was_asked_for_is_a_400()
    {
        var (client, _) = await api.SignInAsync("rosterbody");
        int roster = await RosterAsync(client);

        var broken = new StringContent("{not json", System.Text.Encoding.UTF8, "application/json");

        Assert.Equal(HttpStatusCode.BadRequest, (await client.PostAsync(Rosters, broken)).StatusCode);
        Assert.Equal(
            HttpStatusCode.BadRequest,
            (await client.PutAsync($"{Rosters}/{roster}/cells", broken)).StatusCode);
    }

    [Fact]
    public async Task Without_a_session_the_owner_api_is_shut()
    {
        var anonymous = api.CreateClient();

        Assert.Equal(HttpStatusCode.Unauthorized, (await anonymous.GetAsync(Rosters)).StatusCode);
    }

    // ==== What belongs to whom ====

    [Fact]
    public async Task Another_owners_roster_answers_exactly_like_one_that_does_not_exist()
    {
        var (owner, _) = await api.SignInAsync("rosterowner");
        var (stranger, _) = await api.SignInAsync("rosterstranger");

        int roster = await RosterAsync(owner);
        int person = await PersonAsync(owner, roster);
        string slug = await ShareAsync(owner, roster);

        const int nobody = int.MaxValue;

        async Task<(HttpStatusCode Status, string Body)> AskAsync(Func<int, Task<HttpResponseMessage>> call)
        {
            var response = await call(roster);

            return (response.StatusCode, await response.Content.ReadAsStringAsync());
        }

        async Task SameAsMissingAsync(Func<int, Task<HttpResponseMessage>> call)
        {
            var theirs = await AskAsync(call);
            var missing = await call(nobody);

            Assert.Equal(HttpStatusCode.NotFound, theirs.Status);
            Assert.Equal(missing.StatusCode, theirs.Status);
            Assert.Equal(await missing.Content.ReadAsStringAsync(), theirs.Body);
        }

        await SameAsMissingAsync(id => stranger.GetAsync($"{Rosters}/{id}/month/2026-11"));
        await SameAsMissingAsync(id => stranger.GetAsync($"{Rosters}/{id}/month/not-a-month"));
        await SameAsMissingAsync(id => stranger.PutAsJsonAsync($"{Rosters}/{id}", new { title = "Моё" }));
        await SameAsMissingAsync(id => stranger.DeleteAsync($"{Rosters}/{id}"));
        await SameAsMissingAsync(id => stranger.PostAsJsonAsync(
            $"{Rosters}/{id}/people", new { name = "Чужой", position = (string?)null, colour = "#aabbcc" }));
        await SameAsMissingAsync(id => stranger.PutAsJsonAsync(
            $"{Rosters}/{id}/people/{person}", new { name = "Чужой", position = (string?)null, colour = "#aabbcc" }));
        await SameAsMissingAsync(id => stranger.DeleteAsync($"{Rosters}/{id}/people/{person}"));
        await SameAsMissingAsync(id => CellsAsync(stranger, id, [Cell(person, "2026-11-02")]));
        await SameAsMissingAsync(id => stranger.PostAsJsonAsync($"{Rosters}/{id}/repeat", new { month = "2026-11" }));
        await SameAsMissingAsync(id => stranger.PostAsync($"{Rosters}/{id}/share", null));
        await SameAsMissingAsync(id => stranger.DeleteAsync($"{Rosters}/{id}/share"));

        Assert.Empty((await Read(await stranger.GetAsync(Rosters))).EnumerateArray());

        // And after all of that the owner's roster stands as it was.
        var month = await MonthAsync(owner, roster, "2026-11");

        Assert.Equal("Кальянная", month.GetProperty("title").GetString());
        Assert.Equal(slug, month.GetProperty("share_slug").GetString());
        Assert.Equal("Толик", month.GetProperty("people")[0].GetProperty("name").GetString());
    }

    [Fact]
    public async Task A_person_from_another_roster_fails_the_whole_request()
    {
        var (client, _) = await api.SignInAsync("rosterperson");

        int mine = await RosterAsync(client, "Бар");
        int other = await RosterAsync(client, "Кухня");
        int here = await PersonAsync(client, mine, "Толик");
        int there = await PersonAsync(client, other, "Гриша");

        var refused = await CellsAsync(
            client, mine, [Cell(here, "2026-11-02"), Cell(there, "2026-11-03")]);

        Assert.Equal(HttpStatusCode.NotFound, refused.StatusCode);
        Assert.Empty(Dates(await MonthAsync(client, mine, "2026-11")));

        var clearing = await CellsAsync(client, mine, [Cell(here, "2026-11-02")], [Empty(there, "2026-11-03")]);

        Assert.Equal(HttpStatusCode.NotFound, clearing.StatusCode);
        Assert.Empty(Dates(await MonthAsync(client, mine, "2026-11")));

        Assert.Equal(
            HttpStatusCode.NotFound,
            (await client.PutAsJsonAsync(
                $"{Rosters}/{mine}/people/{there}",
                new { name = "Чужой", position = (string?)null, colour = "#aabbcc" })).StatusCode);

        Assert.Equal(
            HttpStatusCode.NotFound,
            (await client.DeleteAsync($"{Rosters}/{mine}/people/{there}")).StatusCode);
    }

    [Fact]
    public async Task A_whole_batch_fails_when_one_entry_is_bad()
    {
        var (client, _) = await api.SignInAsync("rosterall");
        int roster = await RosterAsync(client);
        int person = await PersonAsync(client, roster);

        await SetAsync(client, roster, Cell(person, "2026-11-10", "09:00", "18:00"));

        object[][] bad =
        [
            [Cell(person, "2026-11-02"), Cell(person, "2026-11-31")],
            [Cell(person, "2026-11-02"), Cell(person, "2026-11-03", "25:00", "22:00")],
            [Cell(person, "2026-11-02"), Cell(person, "2026-11-03", "11:00", "11:00")],
            [Cell(person, "2026-11-10", "12:00", "20:00"), Cell(person, "2026-11-03", "9:00", "22:00")],
        ];

        foreach (var batch in bad)
        {
            var refused = await CellsAsync(client, roster, batch, [Empty(person, "2026-11-10")]);

            Assert.Equal(HttpStatusCode.BadRequest, refused.StatusCode);
        }

        // Nothing landed, and the cell that was there is untouched.
        var shift = (await MonthAsync(client, roster, "2026-11")).GetProperty("shifts").EnumerateArray().Single();

        Assert.Equal("2026-11-10", shift.GetProperty("date").GetString());
        Assert.Equal("09:00", shift.GetProperty("start_time").GetString());
    }

    [Fact]
    public async Task A_batch_of_500_goes_through_and_501_does_not()
    {
        var (client, _) = await api.SignInAsync("rostermax");
        int roster = await RosterAsync(client);
        int person = await PersonAsync(client, roster);

        object[] Days(int count) => Enumerable.Range(0, count)
            .Select(day => Cell(person, new DateOnly(2026, 1, 1).AddDays(day).ToString("yyyy-MM-dd")))
            .ToArray();

        Assert.Equal(HttpStatusCode.BadRequest, (await CellsAsync(client, roster, Days(501))).StatusCode);
        Assert.Empty(Dates(await MonthAsync(client, roster, "2026-01")));

        Assert.Equal(HttpStatusCode.NoContent, (await CellsAsync(client, roster, Days(500))).StatusCode);
        Assert.Equal(31, Dates(await MonthAsync(client, roster, "2026-01")).Length);
    }

    // ==== Repeat ====

    [Fact]
    public async Task Repeat_takes_each_date_from_the_same_weekday_and_occurrence()
    {
        var (client, _) = await api.SignInAsync("rosterrepeat");
        int roster = await RosterAsync(client);
        int person = await PersonAsync(client, roster);

        await SetAsync(
            client,
            roster,
            Cell(person, "2026-10-05", "08:00", "16:00"),
            Cell(person, "2026-10-04", "09:00", "17:00"),
            Cell(person, "2026-10-26", "10:00", "18:00"),
            Cell(person, "2026-10-25", "11:00", "19:00"));

        var repeated = await Read(await client.PostAsJsonAsync(
            $"{Rosters}/{roster}/repeat", new { month = "2026-11" }));

        // The four vectors, plus the fourth Monday and Sunday, which take the
        // same two shifts by their own occurrence.
        Assert.Equal(6, repeated.GetProperty("added").GetInt32());
        Assert.Equal(0, repeated.GetProperty("kept").GetInt32());

        var hours = (await MonthAsync(client, roster, "2026-11")).GetProperty("shifts").EnumerateArray()
            .ToDictionary(
                shift => shift.GetProperty("date").GetString()!,
                shift => shift.GetProperty("start_time").GetString()!);

        Assert.Equal("08:00", hours["2026-11-02"]);
        Assert.Equal("09:00", hours["2026-11-01"]);
        Assert.Equal("10:00", hours["2026-11-30"]);
        Assert.Equal("11:00", hours["2026-11-29"]);
        Assert.Equal("10:00", hours["2026-11-23"]);
        Assert.Equal("11:00", hours["2026-11-22"]);
    }

    [Fact]
    public async Task Repeat_leaves_a_filled_cell_alone_and_counts_it()
    {
        var (client, _) = await api.SignInAsync("rosterkeep");
        int roster = await RosterAsync(client);
        int person = await PersonAsync(client, roster);

        await SetAsync(
            client,
            roster,
            Cell(person, "2026-10-05", "08:00", "16:00"),
            Cell(person, "2026-10-06", "09:00", "17:00"),
            Cell(person, "2026-11-02", "12:00", "20:00"));

        var repeated = await Read(await client.PostAsJsonAsync(
            $"{Rosters}/{roster}/repeat", new { month = "2026-11" }));

        Assert.Equal(1, repeated.GetProperty("added").GetInt32());
        Assert.Equal(1, repeated.GetProperty("kept").GetInt32());

        var month = await MonthAsync(client, roster, "2026-11");
        var kept = month.GetProperty("shifts").EnumerateArray()
            .Single(shift => shift.GetProperty("date").GetString() == "2026-11-02");

        Assert.Equal("12:00", kept.GetProperty("start_time").GetString());

        // A second press changes nothing and says so.
        var again = await Read(await client.PostAsJsonAsync(
            $"{Rosters}/{roster}/repeat", new { month = "2026-11" }));

        Assert.Equal(0, again.GetProperty("added").GetInt32());
        Assert.Equal(2, again.GetProperty("kept").GetInt32());
    }

    // ==== Limits ====

    [Fact]
    public async Task An_owner_can_keep_twenty_rosters()
    {
        var (client, _) = await api.SignInAsync("rosterlimit");

        for (var i = 0; i < 20; i++) await RosterAsync(client, $"График {i}");

        var refused = await client.PostAsJsonAsync(Rosters, new { title = "Двадцать первый" });

        Assert.Equal(HttpStatusCode.BadRequest, refused.StatusCode);
        Assert.Equal(20, (await Read(await client.GetAsync(Rosters))).GetArrayLength());
    }

    [Fact]
    public async Task A_roster_holds_sixty_people()
    {
        var (client, _) = await api.SignInAsync("rosterpeople");
        int roster = await RosterAsync(client);

        for (var i = 0; i < 60; i++) await PersonAsync(client, roster, $"Человек {i}");

        var refused = await client.PostAsJsonAsync(
            $"{Rosters}/{roster}/people", new { name = "Шестьдесят первый", position = (string?)null, colour = "#aabbcc" });

        Assert.Equal(HttpStatusCode.BadRequest, refused.StatusCode);
    }

    /// <summary>Everyone starts counting before anyone has inserted, which is when a limit with nothing holding it gets passed.</summary>
    private static async Task<HttpStatusCode[]> AtOnceAsync(int times, Func<int, Task<HttpResponseMessage>> send)
    {
        var answers = await Task.WhenAll(Enumerable.Range(0, times).Select(send));

        return answers.Select(answer => answer.StatusCode).ToArray();
    }

    [Fact]
    public async Task A_burst_of_creates_cannot_pass_twenty_rosters()
    {
        var (client, _) = await api.SignInAsync("rosterburst");

        for (var i = 0; i < 18; i++) await RosterAsync(client, $"График {i}");

        var answers = await AtOnceAsync(
            12, i => client.PostAsJsonAsync(Rosters, new { title = $"Залп {i}" }));

        Assert.Equal(20, (await Read(await client.GetAsync(Rosters))).GetArrayLength());
        Assert.Equal(2, answers.Count(answer => answer == HttpStatusCode.OK));
        Assert.DoesNotContain(HttpStatusCode.InternalServerError, answers);
    }

    [Fact]
    public async Task A_burst_of_people_cannot_pass_sixty()
    {
        var (client, _) = await api.SignInAsync("rosterburstppl");
        int roster = await RosterAsync(client);

        for (var i = 0; i < 58; i++) await PersonAsync(client, roster, $"Человек {i}");

        var answers = await AtOnceAsync(
            12,
            i => client.PostAsJsonAsync(
                $"{Rosters}/{roster}/people", new { name = $"Залп {i}", position = (string?)null, colour = "#aabbcc" }));

        Assert.Equal(60, (await MonthAsync(client, roster, "2026-11")).GetProperty("people").GetArrayLength());
        Assert.Equal(2, answers.Count(answer => answer == HttpStatusCode.OK));
        Assert.DoesNotContain(HttpStatusCode.InternalServerError, answers);
    }

    [Fact]
    public async Task A_person_for_a_roster_that_is_not_yours_still_answers_as_missing()
    {
        var (owner, _) = await api.SignInAsync("rosterlockown");
        var (stranger, _) = await api.SignInAsync("rosterlockelse");
        int roster = await RosterAsync(owner);

        // Even with a body that would be refused: which refusal came is itself an answer.
        var answer = await stranger.PostAsJsonAsync(
            $"{Rosters}/{roster}/people", new { name = "", position = (string?)null, colour = "nope" });

        Assert.Equal(HttpStatusCode.NotFound, answer.StatusCode);
    }

    [Fact]
    public async Task Text_past_its_limit_and_a_colour_that_is_not_one_are_refused()
    {
        var (client, _) = await api.SignInAsync("rostertext");
        int roster = await RosterAsync(client);

        async Task RefusedAsync(string? name, string? position, string? colour) => Assert.Equal(
            HttpStatusCode.BadRequest,
            (await client.PostAsJsonAsync($"{Rosters}/{roster}/people", new { name, position, colour })).StatusCode);

        Assert.Equal(
            HttpStatusCode.BadRequest,
            (await client.PostAsJsonAsync(Rosters, new { title = new string('я', 61) })).StatusCode);
        Assert.Equal(
            HttpStatusCode.BadRequest,
            (await client.PostAsJsonAsync(Rosters, new { title = "   " })).StatusCode);

        await RefusedAsync(new string('я', 41), null, "#aabbcc");
        await RefusedAsync("", null, "#aabbcc");
        await RefusedAsync("Тол\0ик", null, "#aabbcc");
        await RefusedAsync("Толик", new string('я', 41), "#aabbcc");
        await RefusedAsync("Толик", null, "red");
        await RefusedAsync("Толик", null, "#abc");
        await RefusedAsync("Толик", null, "#aabbcc\"><script>");
        await RefusedAsync("Толик", null, null);
    }

    // ==== The link ====

    [Fact]
    public async Task A_stranger_reads_the_page_with_no_session()
    {
        var (client, _) = await api.SignInAsync("rosterpage");
        int roster = await RosterAsync(client);
        int tolik = await PersonAsync(client, roster, "Толик", "Кальяны", "#aa3355");
        int grisha = await PersonAsync(client, roster, "Гриша", null, "#3355aa");

        await SetAsync(
            client,
            roster,
            Cell(tolik, "2026-10-05", "11:00", "22:00"),
            Cell(grisha, "2026-10-06", "11:30", "22:00"));

        string slug = await ShareAsync(client, roster);

        var stranger = api.CreateClient();
        var response = await OpenAsync(stranger, $"/r/{slug}?month=2026-10");
        var page = await response.Content.ReadAsStringAsync();

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal("text/html", response.Content.Headers.ContentType?.MediaType);

        Assert.Contains("<h1>Кальянная</h1>", page);
        Assert.Contains("Октябрь 2026", page);
        Assert.Contains("Толик", page);
        Assert.Contains("Кальяны", page);
        Assert.Contains("Гриша", page);
        Assert.Contains("#aa3355", page);
        Assert.Contains(">11-22<", page);
        Assert.Contains(">11:30-22<", page);
        Assert.Contains("<main class=\"wide\">", page);
        Assert.Contains("Составлено в <a href=\"/\">Shifter</a>.", page);
        Assert.DoesNotContain("<script", page);
    }

    [Fact]
    public async Task The_page_is_kept_nowhere_and_previews_in_a_chat()
    {
        var (client, _) = await api.SignInAsync("rostermeta");
        int roster = await RosterAsync(client);

        await PersonAsync(client, roster, "Толик");
        await PersonAsync(client, roster, "Гриша");

        string slug = await ShareAsync(client, roster);

        var response = await OpenAsync(api.CreateClient(), $"/r/{slug}?month=2026-10");
        var page = await response.Content.ReadAsStringAsync();

        Assert.True(response.Headers.CacheControl?.NoStore);
        Assert.Contains("<meta name=\"robots\" content=\"noindex\">", page);
        Assert.Contains("<meta property=\"og:title\" content=\"Кальянная\">", page);
        Assert.Contains(
            "<meta property=\"og:description\" content=\"Октябрь 2026 · 2 человека\">",
            WebUtility.HtmlDecode(page));
    }

    /// <summary>A chat's preview may knock before it reads.</summary>
    [Fact]
    public async Task A_head_request_tells_a_live_link_from_a_dead_one()
    {
        var (client, _) = await api.SignInAsync("rosterhead");
        string slug = await ShareAsync(client, await RosterAsync(client));

        var stranger = api.CreateClient();

        using var live = new HttpRequestMessage(HttpMethod.Head, $"/r/{slug}");
        using var dead = new HttpRequestMessage(HttpMethod.Head, "/r/abcdefghjkmn");

        var open = await stranger.SendAsync(live);

        Assert.Equal(HttpStatusCode.OK, open.StatusCode);
        Assert.True(open.Headers.CacheControl?.NoStore);
        Assert.Equal(HttpStatusCode.NotFound, (await stranger.SendAsync(dead)).StatusCode);
    }

    [Fact]
    public async Task Off_reissued_and_unknown_slugs_give_the_same_404()
    {
        var (client, _) = await api.SignInAsync("rostergone");

        int off = await RosterAsync(client, "Выключенный");
        string offSlug = await ShareAsync(client, off);

        Assert.Equal(HttpStatusCode.NoContent, (await client.DeleteAsync($"{Rosters}/{off}/share")).StatusCode);

        int reissued = await RosterAsync(client, "Перевыпущенный");
        string oldSlug = await ShareAsync(client, reissued);

        await ShareAsync(client, reissued);

        var stranger = api.CreateClient();
        var pages = new List<string>();

        foreach (var path in new[] { $"/r/{offSlug}", $"/r/{oldSlug}", "/r/abcdefghjkmn", "/r/short", "/r/abcdefghjkmn/extra" })
        {
            var response = await OpenAsync(stranger, path);

            Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
            Assert.True(response.Headers.CacheControl?.NoStore);

            pages.Add(await response.Content.ReadAsStringAsync());
        }

        Assert.Single(pages.Distinct());
        Assert.Contains("больше не доступен", pages[0]);
        Assert.Contains("<meta name=\"robots\" content=\"noindex\">", pages[0]);
        Assert.DoesNotContain("Выключенный", pages[0]);
        Assert.DoesNotContain("Перевыпущенный", pages[0]);

        Assert.Contains(
            "більше не доступний",
            await (await OpenAsync(stranger, $"/r/{offSlug}", "uk-UA,uk;q=0.9")).Content.ReadAsStringAsync());
    }

    [Fact]
    public async Task Reissuing_kills_the_old_link_at_once_and_opens_the_new_one()
    {
        var (client, _) = await api.SignInAsync("rosterreissue");
        int roster = await RosterAsync(client);

        string first = await ShareAsync(client, roster);

        Assert.Equal(12, first.Length);
        Assert.Equal(first, (await MonthAsync(client, roster, "2026-11")).GetProperty("share_slug").GetString());

        var stranger = api.CreateClient();

        Assert.Equal(HttpStatusCode.OK, (await OpenAsync(stranger, $"/r/{first}")).StatusCode);

        string second = await ShareAsync(client, roster);

        Assert.NotEqual(first, second);
        Assert.Equal(HttpStatusCode.NotFound, (await OpenAsync(stranger, $"/r/{first}")).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await OpenAsync(stranger, $"/r/{second}")).StatusCode);

        Assert.Equal(HttpStatusCode.NoContent, (await client.DeleteAsync($"{Rosters}/{roster}/share")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await OpenAsync(stranger, $"/r/{second}")).StatusCode);
        Assert.Equal(
            JsonValueKind.Null,
            (await MonthAsync(client, roster, "2026-11")).GetProperty("share_slug").ValueKind);
    }

    [Fact]
    public async Task A_name_and_a_position_holding_markup_come_out_escaped()
    {
        var (client, _) = await api.SignInAsync("rosterescape");
        int roster = await RosterAsync(client, "<img src=x onerror=alert(1)>");
        int person = await PersonAsync(client, roster, "<script>alert(1)</script>", "\"><b>x</b>");

        await SetAsync(client, roster, Cell(person, "2026-10-05"));

        string slug = await ShareAsync(client, roster);

        var page = await PageAsync(api.CreateClient(), $"/r/{slug}?month=2026-10");

        Assert.DoesNotContain("<script", page);
        Assert.DoesNotContain("<img", page);
        Assert.DoesNotContain("<b>x</b>", page);
        Assert.DoesNotContain("content=\"<", page);
        Assert.Contains("&lt;script&gt;alert(1)&lt;/script&gt;", page);
        Assert.Contains("&quot;&gt;&lt;b&gt;x&lt;/b&gt;", page);
        Assert.Contains("&lt;img src=x onerror=alert(1)&gt;", page);
    }

    [Fact]
    public async Task A_colour_is_checked_again_on_its_way_out()
    {
        var (client, _) = await api.SignInAsync("rostercolour");
        int roster = await RosterAsync(client);
        int person = await PersonAsync(client, roster);

        await SetAsync(client, roster, Cell(person, "2026-10-05"));

        string slug = await ShareAsync(client, roster);

        // Past the write's own check, as a row from a bad day might be.
        await WithDbAsync(db => db.RosterPeople
            .Where(row => row.Id == person)
            .ExecuteUpdateAsync(set => set.SetProperty(row => row.Colour, "red;x:y")));

        var page = await PageAsync(api.CreateClient(), $"/r/{slug}?month=2026-10");

        Assert.DoesNotContain("red;x:y", page);
        Assert.Contains("#8c8578", page);
    }

    [Fact]
    public async Task The_owners_name_and_email_appear_nowhere_on_the_page()
    {
        var (client, login) = await api.SignInAsync("rosterprivate");
        int roster = await RosterAsync(client);
        int person = await PersonAsync(client, roster);

        await SetAsync(client, roster, Cell(person, "2026-10-05"));

        string slug = await ShareAsync(client, roster);

        await WithDbAsync(db => db.Users
            .Where(user => user.Login == login)
            .ExecuteUpdateAsync(set => set
                .SetProperty(user => user.FirstName, "Аркадий")
                .SetProperty(user => user.LastName, "Владельцев")
                .SetProperty(user => user.Email, "owner@example.test")));

        foreach (var path in new[] { $"/r/{slug}?month=2026-10", $"/r/{slug}?month=2026-01" })
        {
            var page = await PageAsync(api.CreateClient(), path);

            Assert.DoesNotContain("Аркадий", page);
            Assert.DoesNotContain("Владельцев", page);
            Assert.DoesNotContain("owner@example.test", page);
            Assert.DoesNotContain(login, page);
            Assert.DoesNotContain(" id=", page);
            Assert.DoesNotContain("data-", page);
        }
    }

    [Fact]
    public async Task The_month_parameter_turns_the_page_and_a_malformed_one_means_the_current_month()
    {
        await using var host = StoppedHost();

        var (client, _) = await api.SignInAsync("rosterturn", host);
        int roster = await RosterAsync(client);
        int person = await PersonAsync(client, roster);

        await SetAsync(
            client, roster, Cell(person, "2026-11-02", "11:00", "22:00"), Cell(person, "2026-10-05", "08:00", "16:00"));

        string slug = await ShareAsync(client, roster);
        var stranger = host.CreateClient();

        var october = await PageAsync(stranger, $"/r/{slug}?month=2026-10");

        Assert.Contains("<p class=\"month\">Октябрь 2026</p>", october);
        Assert.Contains(">8-16<", october);
        Assert.DoesNotContain(">11-22<", october);
        Assert.Contains($"href=\"/r/{slug}?month=2026-09\"", october);
        Assert.Contains($"href=\"/r/{slug}?month=2026-11\"", october);

        foreach (var month in new[] { "", "?month=", "?month=abc", "?month=2026-13", "?month=2026-1", "?month=0001-01", "?month=9999-12" })
        {
            var page = await PageAsync(stranger, $"/r/{slug}{month}");

            Assert.Contains("<p class=\"month\">Ноябрь 2026</p>", page);
            Assert.Contains(">11-22<", page);
        }

        // The ends of what a roster holds: no link off the edge, and no crash.
        Assert.DoesNotContain("?month=1999-12", await PageAsync(stranger, $"/r/{slug}?month=2000-01"));
        Assert.DoesNotContain("?month=2101-01", await PageAsync(stranger, $"/r/{slug}?month=2100-12"));
    }

    [Fact]
    public async Task Today_leads_the_phone_list_and_the_days_gone_fold_away()
    {
        await using var host = StoppedHost();

        var (client, _) = await api.SignInAsync("rostertoday", host);
        int roster = await RosterAsync(client);
        int tolik = await PersonAsync(client, roster, "Толик", "Кальяны");
        int grisha = await PersonAsync(client, roster, "Гриша", "Бар");

        await SetAsync(
            client,
            roster,
            Cell(tolik, "2026-11-02", "11:00", "22:00"),
            Cell(grisha, "2026-11-16", "12:00", "22:00"),
            Cell(tolik, "2026-11-17", "13:00", "22:00"),
            Cell(grisha, "2026-11-17", "10:00", "22:00"),
            Cell(tolik, "2026-11-20", "14:00", "22:00"));

        string slug = await ShareAsync(client, roster);

        var phone = Phone(await PageAsync(host.CreateClient(), $"/r/{slug}"));

        int now = phone.IndexOf("Сегодня · вт, 17 ноября", StringComparison.Ordinal);
        int ahead = phone.IndexOf("пт, 20 ноября", StringComparison.Ordinal);
        int fold = phone.IndexOf("<details", StringComparison.Ordinal);
        int gone = phone.IndexOf("пн, 2 ноября", StringComparison.Ordinal);
        int yesterday = phone.IndexOf("пн, 16 ноября", StringComparison.Ordinal);

        Assert.True(now >= 0 && now < ahead, phone);
        Assert.True(ahead < fold, phone);
        Assert.True(fold < gone && gone < yesterday, phone);
        Assert.True(yesterday < phone.IndexOf("</details>", StringComparison.Ordinal), phone);

        // Each person as a dot, a name, a position and hours, soonest first.
        Assert.True(
            phone.IndexOf(">10-22<", StringComparison.Ordinal) < phone.IndexOf(">13-22<", StringComparison.Ordinal),
            phone);
        Assert.Contains("<b>Гриша</b><span class=\"post\">Бар</span><span class=\"hours\">10-22</span>", phone);

        // Days nobody works are left out.
        Assert.DoesNotContain("вт, 3 ноября", phone);
    }

    /// <summary>A phone that has told the server where it is.</summary>
    private Task SayZoneAsync(int user, string zone) => WithDbAsync(async db =>
    {
        db.DeviceTokens.Add(new DeviceToken
        {
            UserId = user,
            Token = $"ExponentPushToken[{Guid.NewGuid()}]",
            Platform = "ios",
            TimeZone = zone,
        });

        return await db.SaveChangesAsync();
    });

    private async Task<(int User, HttpClient Client, string Slug, int Person)> SharedRosterAsync(
        string who, WebApplicationFactory<Program> host)
    {
        var (client, login) = await api.SignInAsync(who, host);
        int roster = await RosterAsync(client);
        int person = await PersonAsync(client, roster, "Толик", "Кальяны");
        string slug = await ShareAsync(client, roster);

        return (await UserIdAsync(login), client, slug, person);
    }

    [Fact]
    public async Task Today_is_the_owners_date_rather_than_the_servers()
    {
        await using var host = StoppedHost();

        var (user, client, slug, person) = await SharedRosterAsync("rosterzone", host);

        // Noon on the 17th in Kyiv is already two in the morning on the 18th here.
        await SayZoneAsync(user, "Pacific/Kiritimati");

        await SetAsync(
            client,
            await RosterIdAsync(client),
            Cell(person, "2026-11-17", "11:00", "22:00"),
            Cell(person, "2026-11-18", "12:00", "22:00"));

        string page = await PageAsync(host.CreateClient(), $"/r/{slug}");

        Assert.Contains("Сегодня · ср, 18 ноября", Phone(page));
        Assert.DoesNotContain("Сегодня · вт, 17 ноября", Phone(page));
        Assert.Contains("<details", Phone(page));
    }

    [Fact]
    public async Task The_month_opened_by_default_is_the_owners_too()
    {
        await using var host = StoppedHost(new DateTime(2026, 11, 30, 12, 0, 0, DateTimeKind.Utc));

        var (user, _, slug, _) = await SharedRosterAsync("rosterzonemon", host);

        await SayZoneAsync(user, "Pacific/Kiritimati");

        Assert.Contains("Декабрь 2026", await PageAsync(host.CreateClient(), $"/r/{slug}"));
    }

    [Fact]
    public async Task An_owner_who_never_said_where_they_are_gets_the_apps_own_date()
    {
        await using var host = StoppedHost();

        var (_, client, slug, person) = await SharedRosterAsync("rosternozone", host);

        await SetAsync(client, await RosterIdAsync(client), Cell(person, "2026-11-17"));

        Assert.Contains("Сегодня · вт, 17 ноября", Phone(await PageAsync(host.CreateClient(), $"/r/{slug}")));
    }

    [Fact]
    public async Task A_zone_nobody_has_heard_of_falls_back_to_the_apps_own_date()
    {
        await using var host = StoppedHost();

        var (user, client, slug, person) = await SharedRosterAsync("rosterbadzone", host);

        await SayZoneAsync(user, "Mars/Olympus");
        await SetAsync(client, await RosterIdAsync(client), Cell(person, "2026-11-17"));

        Assert.Contains("Сегодня · вт, 17 ноября", Phone(await PageAsync(host.CreateClient(), $"/r/{slug}")));
    }

    [Fact]
    public async Task A_name_or_a_position_that_is_one_long_word_cannot_push_the_phone_sideways()
    {
        var (client, _) = await api.SignInAsync("rosterlongword");
        int roster = await RosterAsync(client, new string('W', 60));
        string slug = await ShareAsync(client, roster);

        string page = await PageAsync(api.CreateClient(), $"/r/{slug}");

        Assert.Contains("h1,.person b,.post{overflow-wrap:anywhere}", page);
    }

    [Fact]
    public void Caddy_writes_no_roster_slug_or_token_to_its_log()
    {
        var directory = new DirectoryInfo(AppContext.BaseDirectory);

        while (directory is not null && !File.Exists(Path.Combine(directory.FullName, "Shifter.sln")))
            directory = directory.Parent;

        Assert.NotNull(directory);

        string caddy = File.ReadAllText(Path.Combine(directory!.FullName, "docker/Caddyfile"));

        // The rules as the file writes them, run the way Caddy runs them, so the
        // test cannot pass on a filter that is there and catches nothing. There
        // are two: the access log, and Caddy's own logger, which reports a
        // request the app could not answer with the whole request in it.
        var rules = System.Text.RegularExpressions.Regex.Matches(caddy, @"request>uri regexp (\S+) (\S+)");

        Assert.Equal(2, rules.Count);

        foreach (System.Text.RegularExpressions.Match rule in rules)
        {
            string Logged(string uri)
                => System.Text.RegularExpressions.Regex.Replace(uri, rule.Groups[1].Value, rule.Groups[2].Value);

            Assert.Equal("/r/[token]", Logged("/r/abcdefghjkmn"));
            Assert.Equal("/r/[token]?month=2026-11", Logged("/r/abcdefghjkmn?month=2026-11"));
            Assert.Equal("/feed/[token]", Logged("/feed/secret.ics"));
            Assert.Equal("/shifter/v1/hooks/[token]", Logged("/shifter/v1/hooks/telegram/secret"));

            // Routes ignore case, so a link retyped in capitals opens the same thing.
            Assert.Equal("/R/[token]", Logged("/R/abcdefghjkmn"));
            Assert.Equal("/Feed/[token]", Logged("/Feed/secret.ics"));
            Assert.Equal("/SHIFTER/v1/hooks/[token]", Logged("/SHIFTER/v1/hooks/telegram/secret"));

            // Everything else is what the log is for.
            Assert.Equal("/shifter/v1/rosters", Logged("/shifter/v1/rosters"));
            Assert.Equal("/roster", Logged("/roster"));
        }

        // A click from the page to anywhere on this site carries its address
        // along, in both logs.
        Assert.Equal(2, System.Text.RegularExpressions.Regex.Matches(caddy, "request>headers>Referer delete").Count);
    }

    [Fact]
    public async Task Another_month_runs_in_date_order_with_nothing_folded()
    {
        await using var host = StoppedHost();

        var (client, _) = await api.SignInAsync("rosterorder", host);
        int roster = await RosterAsync(client);
        int person = await PersonAsync(client, roster);

        await SetAsync(client, roster, Cell(person, "2026-12-20"), Cell(person, "2026-12-02"));

        string slug = await ShareAsync(client, roster);

        var phone = Phone(await PageAsync(host.CreateClient(), $"/r/{slug}?month=2026-12"));

        Assert.DoesNotContain("<details", phone);
        Assert.DoesNotContain("Сегодня", phone);
        Assert.True(
            phone.IndexOf("ср, 2 декабря", StringComparison.Ordinal)
                < phone.IndexOf("вс, 20 декабря", StringComparison.Ordinal),
            phone);
    }

    [Fact]
    public async Task The_wide_table_marks_today_weekends_and_the_week_each_monday_opens()
    {
        await using var host = StoppedHost();

        var (client, _) = await api.SignInAsync("rostertable", host);
        int roster = await RosterAsync(client);
        int person = await PersonAsync(client, roster, "Толик", "Кальяны", "#aa3355");

        await SetAsync(client, roster, Cell(person, "2026-11-17"));

        string slug = await ShareAsync(client, roster);

        var page = await PageAsync(host.CreateClient(), $"/r/{slug}");

        Assert.Contains("@media (min-width:48rem)", page);
        Assert.Contains("<th scope=\"col\" class=\"today\"><small>вт</small>17</th>", page);
        Assert.Contains("<th scope=\"col\" class=\"we\"><small>сб</small>7</th>", page);
        Assert.Contains("<th scope=\"col\" class=\"we\"><small>вс</small>1</th>", page);
        Assert.Contains("<th scope=\"col\" class=\"mon\"><small>пн</small>2</th>", page);
        Assert.Contains("<td class=\"today\" style=\"background-color:#aa335533\">11-22</td>", page);
        Assert.Contains("<small>Кальяны</small>", page);
        Assert.Equal(30, page.Split("<th scope=\"col\"").Length - 1);
    }

    [Fact]
    public async Task An_empty_month_says_so()
    {
        var (client, _) = await api.SignInAsync("rosterempty");
        int roster = await RosterAsync(client);

        await PersonAsync(client, roster);

        string slug = await ShareAsync(client, roster);

        var page = await PageAsync(api.CreateClient(), $"/r/{slug}?month=2026-02");

        Assert.Contains("В этом месяце смен пока нет.", page);
        Assert.DoesNotContain("<table", page);
        Assert.DoesNotContain("<div class=\"days\">", page);
    }

    [Fact]
    public async Task A_ukrainian_reader_gets_the_page_in_ukrainian()
    {
        await using var host = StoppedHost();

        var (client, _) = await api.SignInAsync("rosteruk", host);
        int roster = await RosterAsync(client);
        int person = await PersonAsync(client, roster);

        await SetAsync(client, roster, Cell(person, "2026-11-17"), Cell(person, "2026-11-22"));

        string slug = await ShareAsync(client, roster);
        var stranger = host.CreateClient();

        var page = await PageAsync(stranger, $"/r/{slug}", "uk-UA,uk;q=0.9");

        Assert.Contains("<html lang=\"uk\">", page);
        Assert.Contains("<p class=\"month\">Листопад 2026</p>", page);
        Assert.Contains("Сьогодні · вт, 17 листопада", page);
        Assert.Contains("<small>нд</small>22", page);
        Assert.Contains("<th scope=\"col\" class=\"mon\"><small>пн</small>2</th>", page);
        Assert.Contains("Складено в <a href=\"/\">Shifter</a>.", page);
        Assert.Contains("Листопад 2026 · 1 людина", WebUtility.HtmlDecode(page));

        Assert.Contains(
            "У цьому місяці змін поки немає.",
            await PageAsync(stranger, $"/r/{slug}?month=2026-02", "uk-UA,uk;q=0.9"));

        Assert.Contains("<html lang=\"ru\">", await PageAsync(stranger, $"/r/{slug}", "en-GB,en;q=0.9"));
    }

    /// <summary>The wide layout is the roster's to ask for: the pages already out there keep the width they had.</summary>
    [Fact]
    public async Task The_other_public_pages_stay_narrow()
    {
        var (client, _) = await api.SignInAsync("rosternarrow");

        var card = await Read(await client.PutAsJsonAsync(
            "/shifter/v1/account/card", new { on = true, show_places = true, show_money = false }));

        var page = await PageAsync(api.CreateClient(), $"/c/{card.GetProperty("slug").GetString()}");

        Assert.Contains("<body><main>", page);
    }

    [Fact]
    public async Task The_page_stays_within_its_query_budget_however_many_people_are_on_it()
    {
        var (client, _) = await api.SignInAsync("rosterbudget");

        async Task<int> CountAsync(int people)
        {
            int roster = await RosterAsync(client, $"На {people}");

            for (var i = 0; i < people; i++)
            {
                int person = await PersonAsync(client, roster, $"Человек {i}");

                await SetAsync(
                    client,
                    roster,
                    Enumerable.Range(1, 30).Select(day => Cell(person, $"2026-11-{day:00}")).ToArray());
            }

            string slug = await ShareAsync(client, roster);

            using var request = new HttpRequestMessage(HttpMethod.Get, $"/r/{slug}?month=2026-11");

            request.Headers.Add(QueryCountMiddleware.Ask, "1");

            var response = await api.CreateClient().SendAsync(request);

            response.EnsureSuccessStatusCode();

            return int.Parse(response.Headers.GetValues(QueryCountMiddleware.Answer).Single());
        }

        int few = await CountAsync(1);
        int many = await CountAsync(60);

        Assert.Equal(few, many);
        Assert.True(many <= 6, $"The page ran {many} queries.");
    }

    [Fact]
    public async Task The_page_is_behind_the_limiter_that_guards_the_other_public_pages()
    {
        await using var host = api.WithWebHostBuilder(builder =>
        {
            builder.UseSetting("RateLimits:ApiBurst", "2");
            builder.UseSetting("RateLimits:ApiPerPeriod", "1");
        });

        var stranger = host.CreateClient();
        var answers = new List<HttpStatusCode>();

        for (var i = 0; i < 4; i++) answers.Add((await stranger.GetAsync("/r/abcdefghjkmn")).StatusCode);

        Assert.Contains(HttpStatusCode.NotFound, answers);
        Assert.Contains(HttpStatusCode.TooManyRequests, answers);
    }

    /// <summary>No-store binds a browser's cache and not this worker's: it stores every page it fetches, whatever the page says.</summary>
    [Fact]
    public void The_service_worker_leaves_a_roster_alone()
    {
        var directory = new DirectoryInfo(AppContext.BaseDirectory);

        while (directory is not null && !File.Exists(Path.Combine(directory.FullName, "Shifter.sln")))
            directory = directory.Parent;

        Assert.NotNull(directory);

        string worker = File.ReadAllText(Path.Combine(directory!.FullName, "web/public/sw.js"));

        int stepsAside = worker.IndexOf("url.pathname.startsWith('/r/')) return;", StringComparison.Ordinal);

        Assert.True(stepsAside >= 0, "The worker no longer steps aside for /r/.");
        Assert.True(stepsAside < worker.IndexOf("const isPage", StringComparison.Ordinal));
    }

    // ==== Leaving things ====

    [Fact]
    public async Task Deleting_a_person_removes_their_shifts()
    {
        var (client, _) = await api.SignInAsync("rosterdelone");
        int roster = await RosterAsync(client);
        int tolik = await PersonAsync(client, roster, "Толик");
        int grisha = await PersonAsync(client, roster, "Гриша");

        await SetAsync(client, roster, Cell(tolik, "2026-11-02"), Cell(grisha, "2026-11-03"));

        Assert.Equal(
            HttpStatusCode.NoContent,
            (await client.DeleteAsync($"{Rosters}/{roster}/people/{tolik}")).StatusCode);

        var month = await MonthAsync(client, roster, "2026-11");

        Assert.Equal("Гриша", month.GetProperty("people").EnumerateArray().Single().GetProperty("name").GetString());
        Assert.Equal(["2026-11-03"], Dates(month));

        Assert.Equal(0, await WithDbAsync(db => db.RosterShifts.CountAsync(row => row.RosterPersonId == tolik)));
    }

    [Fact]
    public async Task Deleting_a_roster_removes_everything_under_it_and_its_link()
    {
        var (client, _) = await api.SignInAsync("rosterdel");
        int roster = await RosterAsync(client);
        int person = await PersonAsync(client, roster);

        await SetAsync(client, roster, Cell(person, "2026-11-02"));

        string slug = await ShareAsync(client, roster);

        Assert.Equal(HttpStatusCode.NoContent, (await client.DeleteAsync($"{Rosters}/{roster}")).StatusCode);

        Assert.Equal(HttpStatusCode.NotFound, (await client.GetAsync($"{Rosters}/{roster}/month/2026-11")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await OpenAsync(api.CreateClient(), $"/r/{slug}")).StatusCode);

        Assert.Equal(0, await WithDbAsync(db => db.RosterPeople.CountAsync(row => row.RosterId == roster)));
        Assert.Equal(0, await WithDbAsync(db => db.RosterShifts.CountAsync(row => row.RosterId == roster)));
    }

    [Fact]
    public async Task Deleting_an_account_removes_its_rosters_and_kills_their_links()
    {
        var (client, login) = await api.SignInAsync("rosterleave");
        int roster = await RosterAsync(client);
        int person = await PersonAsync(client, roster);

        await SetAsync(client, roster, Cell(person, "2026-11-02"));

        string slug = await ShareAsync(client, roster);
        int owner = await UserIdAsync(login);

        var request = new HttpRequestMessage(HttpMethod.Delete, "/shifter/v1/account")
        {
            Content = JsonContent.Create(new { password = "Integration1@x", confirm_login = login }),
        };

        Assert.Equal(HttpStatusCode.NoContent, (await client.SendAsync(request)).StatusCode);

        Assert.Equal(HttpStatusCode.NotFound, (await OpenAsync(api.CreateClient(), $"/r/{slug}")).StatusCode);
        Assert.Equal(0, await WithDbAsync(db => db.Rosters.CountAsync(row => row.UserId == owner)));
        Assert.Equal(0, await WithDbAsync(db => db.RosterPeople.CountAsync(row => row.RosterId == roster)));
        Assert.Equal(0, await WithDbAsync(db => db.RosterShifts.CountAsync(row => row.RosterId == roster)));
    }

    [Fact]
    public async Task The_takeout_carries_rosters_and_only_the_owners()
    {
        var (mine, _) = await api.SignInAsync("rostertakeout");
        var (theirs, _) = await api.SignInAsync("rosterother");

        int roster = await RosterAsync(mine, "Мой график");
        int person = await PersonAsync(mine, roster, "Толик", "Кальяны", "#aa3355");

        await SetAsync(mine, roster, Cell(person, "2026-11-02", "22:00", "06:00"));

        string slug = await ShareAsync(mine, roster);

        await PersonAsync(theirs, await RosterAsync(theirs, "ЧУЖОЙ"), "Чужой");

        var response = await mine.GetAsync("/shifter/v1/account/export");

        response.EnsureSuccessStatusCode();

        using var zip = new ZipArchive(
            new MemoryStream(await response.Content.ReadAsByteArrayAsync()),
            ZipArchiveMode.Read);

        using var reader = new StreamReader(zip.GetEntry("rosters.json")!.Open());

        var text = await reader.ReadToEndAsync();
        var kept = JsonDocument.Parse(text).RootElement.EnumerateArray().Single();
        var who = kept.GetProperty("people").EnumerateArray().Single();
        var shift = who.GetProperty("shifts").EnumerateArray().Single();

        Assert.Equal("Мой график", kept.GetProperty("title").GetString());
        Assert.Equal("Толик", who.GetProperty("name").GetString());
        Assert.Equal("Кальяны", who.GetProperty("position").GetString());
        Assert.Equal("#aa3355", who.GetProperty("colour").GetString());
        Assert.Equal("2026-11-02", shift.GetProperty("date").GetString());
        Assert.Equal("22:00", shift.GetProperty("start").GetString());
        Assert.Equal("06:00", shift.GetProperty("end").GetString());

        Assert.DoesNotContain("ЧУЖОЙ", text);
        Assert.DoesNotContain(slug, text);
    }

    /// <summary>The whole feature stands apart: however much is written here, the owner's own working life does not move.</summary>
    [Fact]
    public async Task A_rosters_writes_leave_no_day_and_no_audit_line()
    {
        var (client, login) = await api.SignInAsync("rosterapart");
        int roster = await RosterAsync(client);
        int person = await PersonAsync(client, roster);

        await SetAsync(client, roster, Cell(person, "2026-10-05"), Cell(person, "2026-10-06"));

        await Read(await client.PostAsJsonAsync($"{Rosters}/{roster}/repeat", new { month = "2026-11" }));
        await ShareAsync(client, roster);

        Assert.Equal(HttpStatusCode.NoContent, (await CellsAsync(client, roster, [], [Empty(person, "2026-10-05")])).StatusCode);

        int owner = await UserIdAsync(login);

        Assert.Equal(0, await WithDbAsync(db => db.Days.CountAsync(row => row.UserId == owner)));
        Assert.Equal(0, await WithDbAsync(db => db.DayAudits.CountAsync(row => row.UserId == owner)));
        Assert.Equal(0, await WithDbAsync(db => db.PlannedAssignments.CountAsync(row => row.UserId == owner)));
    }
}
