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

    /// <summary>A month as an older client reads it, or with bare, as the new ones do: days with no set time included.</summary>
    private static async Task<JsonElement> MonthAsync(HttpClient client, int roster, string month, bool bare = false)
        => await Read(await client.GetAsync($"{Rosters}/{roster}/month/{month}{(bare ? "?bare=1" : "")}"));

    /// <summary>A position as the settings make one. No hours is no set time.</summary>
    private static async Task<int> PositionAsync(HttpClient client, int roster, string name, object? hours = null)
        => (await Read(await client.PostAsJsonAsync($"{Rosters}/{roster}/positions", new { name, hours })))
            .GetProperty("id").GetInt32();

    /// <summary>A person as the new clients save one: the position by id, hours and usual days always sent.</summary>
    private static async Task<int> MemberAsync(
        HttpClient client, int roster, string name, int? position, object? hours = null, object? pattern = null)
        => (await Read(await client.PostAsJsonAsync(
                $"{Rosters}/{roster}/people",
                new
                {
                    name,
                    colour = "#1f3a5f",
                    position_id = position,
                    hours = hours ?? Inherit,
                    pattern = pattern ?? Pattern("none"),
                })))
            .GetProperty("id").GetInt32();

    private static readonly object Inherit = Hours("inherit");

    private static object Hours(string mode, string? start = null, string? end = null, params object[] week)
        => new { mode, start_time = start, end_time = end, week_hours = week };

    private static object Week(int weekday, string start, string end)
        => new { weekday, start_time = start, end_time = end };

    private static object Pattern(string kind, int[]? weekdays = null, int? on = null, int? off = null, string? from = null)
        => new { kind, weekdays = weekdays ?? [], on, off, from };

    /// <summary>The shared cases' bar: twelve till midnight Monday to Thursday, till two Friday and Saturday, shut on Sunday.</summary>
    private static readonly object[] Bar =
    [
        Week(1, "12:00", "00:00"), Week(2, "12:00", "00:00"), Week(3, "12:00", "00:00"), Week(4, "12:00", "00:00"),
        Week(5, "12:00", "02:00"), Week(6, "12:00", "02:00"),
    ];

    private static Task<HttpResponseMessage> VenueAsync(HttpClient client, int roster, object[]? week)
        => client.PutAsJsonAsync($"{Rosters}/{roster}/venue-hours", new { venue_hours = week });

    /// <summary>A filled cell with no set time.</summary>
    private static object Bare(int person, string date)
        => new { person_id = person, date, start_time = (string?)null, end_time = (string?)null };

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
        int position = await PositionAsync(owner, roster, "Бар");
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
        await SameAsMissingAsync(id => VenueAsync(stranger, id, Bar));
        await SameAsMissingAsync(id => VenueAsync(stranger, id, null));
        await SameAsMissingAsync(id => stranger.PostAsJsonAsync($"{Rosters}/{id}/positions", new { name = "Чужая" }));
        await SameAsMissingAsync(id => stranger.PostAsJsonAsync($"{Rosters}/{id}/positions", new { name = "" }));
        await SameAsMissingAsync(id => stranger.PutAsJsonAsync(
            $"{Rosters}/{id}/positions/{position}", new { name = "Чужая", hours = Hours("venue") }));
        await SameAsMissingAsync(id => stranger.DeleteAsync($"{Rosters}/{id}/positions/{position}"));
        await SameAsMissingAsync(id => stranger.PostAsJsonAsync($"{Rosters}/{id}/fill", new { month = "2026-11" }));
        await SameAsMissingAsync(id => stranger.PostAsJsonAsync($"{Rosters}/{id}/fill", new { month = "nope" }));
        await SameAsMissingAsync(id => stranger.PostAsJsonAsync($"{Rosters}/{id}/clear", new { month = "2026-11" }));

        Assert.Empty((await Read(await stranger.GetAsync(Rosters))).EnumerateArray());

        // And after all of that the owner's roster stands as it was.
        var month = await MonthAsync(owner, roster, "2026-11");

        Assert.Equal("Кальянная", month.GetProperty("title").GetString());
        Assert.Equal(slug, month.GetProperty("share_slug").GetString());
        Assert.Equal("Толик", month.GetProperty("people")[0].GetProperty("name").GetString());
        Assert.Equal(0, month.GetProperty("venue_hours").GetArrayLength());
        Assert.Equal(
            ["Кальяны", "Бар"],
            month.GetProperty("positions").EnumerateArray().Select(row => row.GetProperty("name").GetString()));
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

        // Each person as a dot, a name and hours, under the position they
        // share, the positions in the order they were made.
        int hookahs = phone.IndexOf("<li class=\"group\">Кальяны</li>", now, StringComparison.Ordinal);
        int bar = phone.IndexOf("<li class=\"group\">Бар</li>", now, StringComparison.Ordinal);

        Assert.True(now < hookahs && hookahs < phone.IndexOf(">13-22<", now, StringComparison.Ordinal), phone);
        Assert.True(phone.IndexOf(">13-22<", now, StringComparison.Ordinal) < bar, phone);
        Assert.True(bar < phone.IndexOf(">10-22<", now, StringComparison.Ordinal), phone);
        Assert.Contains("<b>Гриша</b><span class=\"hours\">10-22</span>", phone);
        Assert.DoesNotContain("class=\"post\"", phone);

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

        Assert.Contains("h1,.person b,.day .group{overflow-wrap:anywhere}", page);
    }

    /// <summary>The words a screen reader says for a day with no time are placed absolutely, against the sheet that scrolls. Placed against the page, the last days' would sit out past the table and widen the whole page on a tablet.</summary>
    [Fact]
    public async Task A_day_with_no_time_late_in_the_month_cannot_push_the_page_sideways()
    {
        var (client, _) = await api.SignInAsync("rosterlatebare");
        int roster = await RosterAsync(client);
        int person = await PersonAsync(client, roster, "Женя", null);

        await SetAsync(client, roster, Bare(person, "2026-11-30"));

        string page = WebUtility.HtmlDecode(await PageAsync(api.CreateClient(), $"/r/{await ShareAsync(client, roster)}?month=2026-11"));
        string sheet = page[page.IndexOf("<div class=\"sheet\">", StringComparison.Ordinal)..page.IndexOf("<div class=\"days\">", StringComparison.Ordinal)];

        Assert.Contains("<span class=\"sr\">без времени</span></td></tr></tbody></table></div>", sheet);
        Assert.Contains(".sr{clip:rect(0 0 0 0);height:1px;overflow:hidden;position:absolute;width:1px}", page);
        Assert.Contains(".sheet{display:none;overflow-x:auto;position:relative}", page);
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
        Assert.Contains(
            "<tr class=\"group\"><th scope=\"rowgroup\" class=\"who\">Кальяны</th><td colspan=\"30\"></td></tr>", page);
        Assert.DoesNotContain("<small>Кальяны</small>", page);
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

        // Everybody on a position, the venue's hours set, and a third of the
        // days with no set time: the groups, the venue line and the dots all
        // have to come out of the same reads.
        async Task<int> CountAsync(int people)
        {
            int roster = await RosterAsync(client, $"На {people}");

            Assert.Equal(HttpStatusCode.OK, (await VenueAsync(client, roster, Bar)).StatusCode);

            for (var i = 0; i < people; i++)
            {
                int person = await PersonAsync(client, roster, $"Человек {i}", i % 2 == 0 ? "Кальяны" : "Бар");

                await SetAsync(
                    client,
                    roster,
                    Enumerable.Range(1, 30)
                        .Select(day => day % 3 == 0 ? Bare(person, $"2026-11-{day:00}") : Cell(person, $"2026-11-{day:00}"))
                        .ToArray());
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

        int position = await PositionAsync(client, roster, "Бар", Hours("own", "18:00", "02:00"));

        await Read(await client.PutAsJsonAsync(
            $"{Rosters}/{roster}/people/{person}",
            new { name = "Толик", colour = "#1f3a5f", position_id = position, hours = Inherit, pattern = Pattern("weekdays", [1, 5]) }));
        await Read(await VenueAsync(client, roster, Bar));
        await Read(await client.PostAsJsonAsync($"{Rosters}/{roster}/fill", new { month = "2100-12" }));
        await Read(await client.PostAsJsonAsync($"{Rosters}/{roster}/clear", new { month = "2100-12" }));

        int owner = await UserIdAsync(login);

        Assert.Equal(0, await WithDbAsync(db => db.Days.CountAsync(row => row.UserId == owner)));
        Assert.Equal(0, await WithDbAsync(db => db.DayAudits.CountAsync(row => row.UserId == owner)));
        Assert.Equal(0, await WithDbAsync(db => db.PlannedAssignments.CountAsync(row => row.UserId == owner)));
    }

    // ==== Shapes ====

    private static string[] Names(JsonElement list)
        => list.EnumerateArray().Select(row => row.GetProperty("name").GetString()!).ToArray();

    private static async Task<string> RefusalAsync(HttpResponseMessage response)
    {
        string body = await response.Content.ReadAsStringAsync();

        Assert.True(response.StatusCode == HttpStatusCode.BadRequest, $"{(int)response.StatusCode}: {body}");

        return JsonDocument.Parse(body).RootElement.GetProperty("message").GetString()!;
    }

    [Fact]
    public async Task The_list_carries_venue_hours_positions_and_peoples_hours_and_days()
    {
        var (client, _) = await api.SignInAsync("rosterlistnew");
        int roster = await RosterAsync(client);

        await Read(await VenueAsync(client, roster, [Week(6, "12:00", "02:00"), Week(1, "12:00", "00:00")]));

        int bar = await PositionAsync(
            client, roster, "Бар", Hours("own", "18:00", "02:00", Week(5, "18:00", "04:00")));
        int hookahs = await PositionAsync(client, roster, "Кальяны", Hours("venue"));

        int tolik = await MemberAsync(
            client, roster, "Толик", bar,
            Hours("own", "09:00", "17:00", Week(6, "10:00", "15:00")),
            Pattern("cycle", on: 2, off: 2, from: "2026-11-03"));
        int grisha = await PersonAsync(client, roster, "Гриша", "Уборка");

        // A second roster, so the split reads have more than one to sort out.
        await PositionAsync(client, await RosterAsync(client, "Второй"), "Кухня");

        var listed = (await Read(await client.GetAsync(Rosters))).EnumerateArray()
            .Single(row => row.GetProperty("id").GetInt32() == roster);

        var venue = listed.GetProperty("venue_hours");

        Assert.Equal([1, 6], venue.EnumerateArray().Select(day => day.GetProperty("weekday").GetInt32()));
        Assert.Equal("02:00", venue[1].GetProperty("end_time").GetString());

        var positions = listed.GetProperty("positions");

        Assert.Equal(["Бар", "Кальяны", "Уборка"], Names(positions));
        Assert.Equal(bar, positions[0].GetProperty("id").GetInt32());
        Assert.Equal("own", positions[0].GetProperty("hours").GetProperty("mode").GetString());
        Assert.Equal("18:00", positions[0].GetProperty("hours").GetProperty("start_time").GetString());
        Assert.Equal(5, positions[0].GetProperty("hours").GetProperty("week_hours")[0].GetProperty("weekday").GetInt32());
        Assert.Equal(hookahs, positions[1].GetProperty("id").GetInt32());
        Assert.Equal("venue", positions[1].GetProperty("hours").GetProperty("mode").GetString());
        Assert.Equal(JsonValueKind.Null, positions[1].GetProperty("hours").GetProperty("start_time").ValueKind);
        Assert.Equal("none", positions[2].GetProperty("hours").GetProperty("mode").GetString());

        var people = listed.GetProperty("people");
        var first = people[0];

        Assert.Equal(tolik, first.GetProperty("id").GetInt32());
        Assert.Equal(bar, first.GetProperty("position_id").GetInt32());
        Assert.Equal("Бар", first.GetProperty("position").GetString());
        Assert.Equal("own", first.GetProperty("hours").GetProperty("mode").GetString());
        Assert.Equal("09:00", first.GetProperty("hours").GetProperty("start_time").GetString());
        Assert.Equal("15:00", first.GetProperty("hours").GetProperty("week_hours")[0].GetProperty("end_time").GetString());
        Assert.Equal("cycle", first.GetProperty("pattern").GetProperty("kind").GetString());
        Assert.Equal(2, first.GetProperty("pattern").GetProperty("on").GetInt32());
        Assert.Equal("2026-11-03", first.GetProperty("pattern").GetProperty("from").GetString());
        Assert.Equal(0, first.GetProperty("pattern").GetProperty("weekdays").GetArrayLength());

        var second = people[1];

        Assert.Equal(grisha, second.GetProperty("id").GetInt32());
        Assert.Equal(positions[2].GetProperty("id").GetInt32(), second.GetProperty("position_id").GetInt32());
        Assert.Equal("inherit", second.GetProperty("hours").GetProperty("mode").GetString());
        Assert.Equal(0, second.GetProperty("hours").GetProperty("week_hours").GetArrayLength());
        Assert.Equal("none", second.GetProperty("pattern").GetProperty("kind").GetString());
        Assert.Equal(JsonValueKind.Null, second.GetProperty("pattern").GetProperty("from").ValueKind);
    }

    [Fact]
    public async Task A_new_roster_and_a_renamed_one_answer_with_no_venue_hours_and_no_positions()
    {
        var (client, _) = await api.SignInAsync("rosternewshape");

        var made = await Read(await client.PostAsJsonAsync(Rosters, new { title = "Кальянная" }));

        Assert.Equal(0, made.GetProperty("venue_hours").GetArrayLength());
        Assert.Equal(0, made.GetProperty("positions").GetArrayLength());

        int roster = made.GetProperty("id").GetInt32();

        await PersonAsync(client, roster, "Толик", null);

        var renamed = await Read(await client.PutAsJsonAsync($"{Rosters}/{roster}", new { title = "Бар" }));

        Assert.Equal(0, renamed.GetProperty("venue_hours").GetArrayLength());
        Assert.Equal(0, renamed.GetProperty("positions").GetArrayLength());
        Assert.Equal("inherit", renamed.GetProperty("people")[0].GetProperty("hours").GetProperty("mode").GetString());
        Assert.Equal("none", renamed.GetProperty("people")[0].GetProperty("pattern").GetProperty("kind").GetString());
    }

    // ==== Venue hours ====

    [Fact]
    public async Task Venue_hours_are_set_read_back_in_weekday_order_and_cleared()
    {
        var (client, _) = await api.SignInAsync("rostervenue");
        int roster = await RosterAsync(client);

        var saved = await Read(await VenueAsync(
            client, roster, [Week(6, "12:00", "02:00"), Week(1, "12:00", "00:00"), Week(5, "12:00", "04:00")]));

        Assert.Equal([1, 5, 6], saved.GetProperty("venue_hours").EnumerateArray().Select(day => day.GetProperty("weekday").GetInt32()));
        Assert.Equal(0, saved.GetProperty("restamped").GetInt32());

        var month = await MonthAsync(client, roster, "2026-11");

        Assert.Equal([1, 5, 6], month.GetProperty("venue_hours").EnumerateArray().Select(day => day.GetProperty("weekday").GetInt32()));
        Assert.Equal("04:00", month.GetProperty("venue_hours")[1].GetProperty("end_time").GetString());

        var cleared = await Read(await VenueAsync(client, roster, []));

        Assert.Equal(0, cleared.GetProperty("venue_hours").GetArrayLength());
        Assert.Equal(0, (await MonthAsync(client, roster, "2026-11")).GetProperty("venue_hours").GetArrayLength());
    }

    [Fact]
    public async Task Venue_hours_that_are_not_hours_are_refused_and_change_nothing()
    {
        var (client, _) = await api.SignInAsync("rostervenuebad");
        int roster = await RosterAsync(client);

        await Read(await VenueAsync(client, roster, [Week(1, "12:00", "00:00")]));

        (object[]? Week, string Message)[] bad =
        [
            ([Week(0, "12:00", "00:00")], "weekday must be from 1 to 7."),
            ([Week(8, "12:00", "00:00")], "weekday must be from 1 to 7."),
            ([Week(2, "12:00", "00:00"), Week(2, "14:00", "00:00")], "A weekday is listed more than once."),
            ([Week(2, "25:00", "00:00")], "start_time must be HH:mm."),
            ([Week(2, "12:00", "12:00")], "Start and end time must differ."),
            ([new { weekday = 2, start_time = "12:00" }], "end_time must be HH:mm."),
            (null, "venue_hours is required."),
        ];

        foreach (var (week, message) in bad)
            Assert.Equal(message, await RefusalAsync(await VenueAsync(client, roster, week)));

        var venue = (await MonthAsync(client, roster, "2026-11")).GetProperty("venue_hours");

        Assert.Equal(1, venue.GetArrayLength());
        Assert.Equal(1, venue[0].GetProperty("weekday").GetInt32());
    }

    /// <summary>The writes that take no lock touch only what they change. A whole roster row saved beside a first venue save would put back the empty list it read, and the hours the owner was told were saved would be gone.</summary>
    [Fact]
    public async Task Venue_hours_saved_beside_the_writes_that_take_no_lock_stay_saved()
    {
        // The running clock: a stopped one stamps the time the row already
        // holds, and a save with nothing changed writes no row to race.
        var (client, _) = await api.SignInAsync("rostervenrace");
        int roster = await RosterAsync(client);
        int person = await PersonAsync(client, roster, "Толик", null);

        // A month for the repeat to copy into the next, which the clear then empties again.
        await SetAsync(client, roster, Enumerable.Range(1, 30).Select(day => Cell(person, $"2100-11-{day:00}")).ToArray());

        string[] kinds = ["cells", "rename", "share", "unshare", "repeat", "clear", "remove"];
        var lost = new List<string>();

        for (var round = 0; round < 3 * kinds.Length; round++)
        {
            string kind = kinds[round % kinds.Length];

            // Empty again every round: an empty list is what a whole-row save carried back.
            await Read(await VenueAsync(client, roster, []));

            var leaving = new Queue<int>();

            for (var i = 0; kind == "remove" && i < 12; i++) leaving.Enqueue(await PersonAsync(client, roster, $"Уходит {round}.{i}", null));

            Task<HttpResponseMessage> Beside(int i) => kind switch
            {
                "cells" => CellsAsync(client, roster, [Cell(person, $"2100-11-{i % 30 + 1:00}", "12:00", $"{i % 10 + 13}:00")]),
                "rename" => client.PutAsJsonAsync($"{Rosters}/{roster}", new { title = $"Кальянная {round}.{i}" }),
                "share" => client.PostAsync($"{Rosters}/{roster}/share", null),
                "unshare" => client.DeleteAsync($"{Rosters}/{roster}/share"),
                "repeat" => client.PostAsJsonAsync($"{Rosters}/{roster}/repeat", new { month = "2100-12" }),
                "clear" => i % 2 == 0
                    ? client.PostAsJsonAsync($"{Rosters}/{roster}/repeat", new { month = "2100-12" })
                    : client.PostAsJsonAsync($"{Rosters}/{roster}/clear", new { month = "2100-12" }),
                _ => client.DeleteAsync($"{Rosters}/{roster}/people/{(leaving.TryDequeue(out int next) ? next : int.MaxValue)}"),
            };

            // Writes keep starting for as long as the venue save is under way,
            // so some read the roster before it lands and write after it.
            var saved = VenueAsync(client, roster, Bar);
            var beside = new List<Task<HttpResponseMessage>>();

            for (var i = 0; !saved.IsCompleted && i < 200; i++)
            {
                beside.Add(Beside(i));

                await Task.Delay(1);
            }

            await Read(await saved);

            foreach (var answer in await Task.WhenAll(beside))
            {
                Assert.True(
                    answer.IsSuccessStatusCode || (kind == "remove" && answer.StatusCode == HttpStatusCode.NotFound),
                    $"{kind}: {(int)answer.StatusCode} {answer.RequestMessage?.RequestUri}");
            }

            if ((await MonthAsync(client, roster, "2100-11")).GetProperty("venue_hours").GetArrayLength() != 6)
                lost.Add($"{kind}, round {round}");
        }

        Assert.True(lost.Count == 0, $"The venue hours were undone beside: {string.Join("; ", lost)}.");
    }

    // ==== Positions ====

    /// <summary>The old free-text column, person by person, "-" for none: what the release before positions would read.</summary>
    private async Task<string> LegacyAsync(int roster) => string.Join(',', (await WithDbAsync(db => db.RosterPeople
            .Where(row => row.RosterId == roster)
            .OrderBy(row => row.Id)
            .Select(row => row.Position)
            .ToArrayAsync()))
        .Select(position => position ?? "-"));

    [Fact]
    public async Task A_position_is_made_renamed_and_deleted_and_its_people_stay()
    {
        var (client, _) = await api.SignInAsync("rosterposition");
        int roster = await RosterAsync(client);
        int position = await PositionAsync(client, roster, "Бар");
        int person = await MemberAsync(client, roster, "Толик", position);

        await SetAsync(client, roster, Cell(person, "2026-11-02"));

        Assert.Equal("Бар", await LegacyAsync(roster));

        var renamed = await Read(await client.PutAsJsonAsync(
            $"{Rosters}/{roster}/positions/{position}", new { name = "  Бармены " }));

        Assert.Equal("Бармены", renamed.GetProperty("name").GetString());
        Assert.Equal("none", renamed.GetProperty("hours").GetProperty("mode").GetString());
        Assert.Equal(0, renamed.GetProperty("restamped").GetInt32());
        Assert.Equal("Бармены", (await MonthAsync(client, roster, "2026-11")).GetProperty("people")[0].GetProperty("position").GetString());
        Assert.Equal("Бармены", await LegacyAsync(roster));

        var deleted = await Read(await client.DeleteAsync($"{Rosters}/{roster}/positions/{position}"));

        Assert.Equal(0, deleted.GetProperty("restamped").GetInt32());

        var month = await MonthAsync(client, roster, "2026-11");
        var who = month.GetProperty("people").EnumerateArray().Single();

        Assert.Equal(0, month.GetProperty("positions").GetArrayLength());
        Assert.Equal(person, who.GetProperty("id").GetInt32());
        Assert.Equal(JsonValueKind.Null, who.GetProperty("position_id").ValueKind);
        Assert.Equal(JsonValueKind.Null, who.GetProperty("position").ValueKind);
        Assert.Equal(["2026-11-02"], Dates(month));
        Assert.Equal("-", await LegacyAsync(roster));

        Assert.Equal(
            HttpStatusCode.NotFound,
            (await client.DeleteAsync($"{Rosters}/{roster}/positions/{position}")).StatusCode);
        Assert.Equal(
            HttpStatusCode.NotFound,
            (await client.PutAsJsonAsync($"{Rosters}/{roster}/positions/{position}", new { name = "Бар" })).StatusCode);
    }

    [Fact]
    public async Task A_new_position_has_no_set_time()
    {
        var (client, _) = await api.SignInAsync("rosterposnone");
        int roster = await RosterAsync(client);

        foreach (var body in new object[] { new { name = "Бар" }, new { name = "Кухня", hours = (object?)null } })
        {
            var made = await Read(await client.PostAsJsonAsync($"{Rosters}/{roster}/positions", body));
            var hours = made.GetProperty("hours");

            Assert.Equal("none", hours.GetProperty("mode").GetString());
            Assert.Equal(JsonValueKind.Null, hours.GetProperty("start_time").ValueKind);
            Assert.Equal(JsonValueKind.Null, hours.GetProperty("end_time").ValueKind);
            Assert.Equal(0, hours.GetProperty("week_hours").GetArrayLength());
        }

        // Hours left out of a rename stay as they are.
        int own = await PositionAsync(client, roster, "Кальяны", Hours("own", "18:00", "02:00"));

        var renamed = await Read(await client.PutAsJsonAsync($"{Rosters}/{roster}/positions/{own}", new { name = "Кальянщики" }));

        Assert.Equal("own", renamed.GetProperty("hours").GetProperty("mode").GetString());
        Assert.Equal("02:00", renamed.GetProperty("hours").GetProperty("end_time").GetString());

        Assert.Equal(
            "hours.mode must be none, own or venue.",
            await RefusalAsync(await client.PostAsJsonAsync(
                $"{Rosters}/{roster}/positions", new { name = "Уборка", hours = Hours("Venue") })));
    }

    [Fact]
    public async Task A_position_name_is_unique_on_its_roster_ignoring_case_and_spaces()
    {
        var (client, _) = await api.SignInAsync("rosterposuniq");
        int roster = await RosterAsync(client);
        int other = await RosterAsync(client, "Второй");

        await PositionAsync(client, roster, "Бар");
        int kitchen = await PositionAsync(client, roster, "Кухня");

        Assert.Equal(
            "A position with that name is already on this roster.",
            await RefusalAsync(await client.PostAsJsonAsync($"{Rosters}/{roster}/positions", new { name = " бар " })));
        Assert.Equal(
            "A position with that name is already on this roster.",
            await RefusalAsync(await client.PutAsJsonAsync($"{Rosters}/{roster}/positions/{kitchen}", new { name = "БАР" })));

        int there = await PositionAsync(client, other, "бар");

        var renamed = await Read(await client.PutAsJsonAsync($"{Rosters}/{other}/positions/{there}", new { name = "Бар" }));

        Assert.Equal("Бар", renamed.GetProperty("name").GetString());
        Assert.Equal(["Бар", "Кухня"], Names((await MonthAsync(client, roster, "2026-11")).GetProperty("positions")));
        Assert.Equal(["Бар"], Names((await MonthAsync(client, other, "2026-11")).GetProperty("positions")));
    }

    [Fact]
    public async Task A_roster_holds_twenty_positions()
    {
        var (client, _) = await api.SignInAsync("rosterposcap");
        int roster = await RosterAsync(client);

        for (var i = 0; i < 20; i++) await PositionAsync(client, roster, $"Должность {i}");

        Assert.Equal(
            "A roster holds at most 20 positions.",
            await RefusalAsync(await client.PostAsJsonAsync($"{Rosters}/{roster}/positions", new { name = "Двадцать первая" })));
        Assert.Equal(20, (await MonthAsync(client, roster, "2026-11")).GetProperty("positions").GetArrayLength());
    }

    [Fact]
    public async Task A_burst_of_positions_cannot_pass_twenty()
    {
        var (client, _) = await api.SignInAsync("rosterposburst");
        int roster = await RosterAsync(client);

        for (var i = 0; i < 18; i++) await PositionAsync(client, roster, $"Должность {i}");

        var answers = await AtOnceAsync(
            12, i => client.PostAsJsonAsync($"{Rosters}/{roster}/positions", new { name = $"Залп {i}" }));

        Assert.Equal(20, (await MonthAsync(client, roster, "2026-11")).GetProperty("positions").GetArrayLength());
        Assert.Equal(2, answers.Count(answer => answer == HttpStatusCode.OK));
        Assert.DoesNotContain(HttpStatusCode.InternalServerError, answers);
    }

    [Fact]
    public async Task A_burst_of_positions_and_older_clients_typing_new_words_stays_within_twenty()
    {
        var (client, _) = await api.SignInAsync("rosterposmixed");
        int roster = await RosterAsync(client);

        for (var i = 0; i < 16; i++) await PositionAsync(client, roster, $"Должность {i}");

        // Half make a position outright, half are an older client's person
        // typing a word nobody has used: people lock, then the defaults lock.
        var answers = await AtOnceAsync(12, i => i % 2 == 0
            ? client.PostAsJsonAsync($"{Rosters}/{roster}/positions", new { name = $"Залп {i}" })
            : client.PostAsJsonAsync(
                $"{Rosters}/{roster}/people", new { name = $"Человек {i}", position = $"Слово {i}", colour = "#aabbcc" }));

        var month = await MonthAsync(client, roster, "2026-11");

        Assert.Equal(20, month.GetProperty("positions").GetArrayLength());
        Assert.Equal(4, answers.Count(answer => answer == HttpStatusCode.OK));
        Assert.DoesNotContain(HttpStatusCode.InternalServerError, answers);

        // Nobody got a position the roster does not hold.
        var held = month.GetProperty("positions").EnumerateArray().Select(row => row.GetProperty("id").GetInt32()).ToHashSet();

        Assert.All(month.GetProperty("people").EnumerateArray(), person => Assert.Contains(person.GetProperty("position_id").GetInt32(), held));
    }

    [Fact]
    public async Task Deleting_a_position_while_its_person_is_removed_is_never_a_500()
    {
        var (client, _) = await api.SignInAsync("rosterposrace");
        int roster = await RosterAsync(client);

        for (var round = 0; round < 6; round++)
        {
            int position = await PositionAsync(client, roster, $"Должность {round}", Hours("own", "18:00", "02:00"));
            int person = await MemberAsync(client, roster, $"Человек {round}", position);

            await SetAsync(client, roster, Cell(person, "2100-12-06", "18:00", "02:00"));

            var answers = await Task.WhenAll(
                client.DeleteAsync($"{Rosters}/{roster}/positions/{position}"),
                client.DeleteAsync($"{Rosters}/{roster}/people/{person}"));

            Assert.All(answers, answer => Assert.True(answer.IsSuccessStatusCode, $"{(int)answer.StatusCode}"));
        }

        var month = await MonthAsync(client, roster, "2100-12");

        Assert.Equal(0, month.GetProperty("positions").GetArrayLength());
        Assert.Equal(0, month.GetProperty("people").GetArrayLength());
    }

    [Fact]
    public async Task A_position_from_another_roster_answers_as_missing()
    {
        var (client, _) = await api.SignInAsync("rosterposother");
        int mine = await RosterAsync(client);
        int other = await RosterAsync(client, "Второй");
        int theirs = await PositionAsync(client, other, "Бар");
        int person = await MemberAsync(client, mine, "Толик", null);

        var added = await client.PostAsJsonAsync(
            $"{Rosters}/{mine}/people",
            new { name = "Гриша", colour = "#aabbcc", position_id = theirs, hours = Inherit, pattern = Pattern("none") });
        var moved = await client.PutAsJsonAsync(
            $"{Rosters}/{mine}/people/{person}",
            new { name = "Толик", colour = "#aabbcc", position_id = theirs, hours = Inherit, pattern = Pattern("none") });

        foreach (var answer in new[] { added, moved })
        {
            Assert.Equal(HttpStatusCode.NotFound, answer.StatusCode);
            Assert.Contains("Position does not exist.", await answer.Content.ReadAsStringAsync());
        }

        var month = await MonthAsync(client, mine, "2026-11");
        var who = month.GetProperty("people").EnumerateArray().Single();

        Assert.Equal(JsonValueKind.Null, who.GetProperty("position_id").ValueKind);
        Assert.Equal("#1f3a5f", who.GetProperty("colour").GetString());
        Assert.Equal(0, month.GetProperty("positions").GetArrayLength());
    }

    // ==== People ====

    private static JsonElement Who(JsonElement month, int person)
        => month.GetProperty("people").EnumerateArray().Single(row => row.GetProperty("id").GetInt32() == person);

    [Fact]
    public async Task A_person_carries_a_position_own_hours_and_usual_days_both_ways()
    {
        var (client, _) = await api.SignInAsync("rosterppshape");
        int roster = await RosterAsync(client);
        int bar = await PositionAsync(client, roster, "Бар");

        var made = await Read(await client.PostAsJsonAsync(
            $"{Rosters}/{roster}/people",
            new
            {
                name = "Толик",
                colour = "#AA3355",
                position_id = bar,
                hours = Hours("own", "22:00", "06:00", Week(6, "10:00", "15:00"), Week(5, "21:00", "05:00")),
                pattern = Pattern("cycle", [1, 2], 3, 2, "2026-11-03"),
            }));

        int tolik = made.GetProperty("id").GetInt32();
        int grisha = await MemberAsync(client, roster, "Гриша", null, Inherit, Pattern("weekdays", [5, 1, 3]));

        foreach (var who in new[] { made, Who(await MonthAsync(client, roster, "2026-11", bare: true), tolik) })
        {
            Assert.Equal("Толик", who.GetProperty("name").GetString());
            Assert.Equal("#aa3355", who.GetProperty("colour").GetString());
            Assert.Equal(bar, who.GetProperty("position_id").GetInt32());
            Assert.Equal("Бар", who.GetProperty("position").GetString());

            var hours = who.GetProperty("hours");

            Assert.Equal("own", hours.GetProperty("mode").GetString());
            Assert.Equal(("22:00", "06:00"), (hours.GetProperty("start_time").GetString(), hours.GetProperty("end_time").GetString()));
            Assert.Equal([5, 6], hours.GetProperty("week_hours").EnumerateArray().Select(day => day.GetProperty("weekday").GetInt32()));

            var pattern = who.GetProperty("pattern");

            Assert.Equal("cycle", pattern.GetProperty("kind").GetString());
            Assert.Equal(0, pattern.GetProperty("weekdays").GetArrayLength());
            Assert.Equal((3, 2), (pattern.GetProperty("on").GetInt32(), pattern.GetProperty("off").GetInt32()));
            Assert.Equal("2026-11-03", pattern.GetProperty("from").GetString());
        }

        var second = Who(await MonthAsync(client, roster, "2026-11"), grisha);

        Assert.Equal([1, 3, 5], second.GetProperty("pattern").GetProperty("weekdays").EnumerateArray().Select(day => day.GetInt32()));
        Assert.Equal(JsonValueKind.Null, second.GetProperty("pattern").GetProperty("on").ValueKind);

        // And back the other way: no hours of their own and no usual days.
        var saved = await Read(await client.PutAsJsonAsync(
            $"{Rosters}/{roster}/people/{tolik}",
            new { name = "Толик", colour = "#aa3355", position_id = bar, hours = Inherit, pattern = Pattern("none") }));

        Assert.Equal("inherit", saved.GetProperty("hours").GetProperty("mode").GetString());
        Assert.Equal("none", saved.GetProperty("pattern").GetProperty("kind").GetString());
        Assert.Equal(0, saved.GetProperty("restamped").GetInt32());

        var row = await WithDbAsync(db => db.RosterPeople.AsNoTracking().SingleAsync(person => person.Id == tolik));

        Assert.Null(row.StartTime);
        Assert.Empty(row.WeekHours);
        Assert.Null(row.CycleOn);
        Assert.Null(row.CycleFrom);
        Assert.Null(row.PatternWeekdays);
    }

    [Fact]
    public async Task A_person_save_that_is_not_one_is_refused_with_what_was_wrong()
    {
        var (client, _) = await api.SignInAsync("rosterppbad");
        int roster = await RosterAsync(client);

        async Task<string> RefusedAsync(object? hours, object? pattern)
            => await RefusalAsync(await client.PostAsJsonAsync(
                $"{Rosters}/{roster}/people",
                new { name = "Толик", colour = "#aabbcc", position_id = (int?)null, hours, pattern }));

        Assert.Equal("hours.mode must be inherit or own.", await RefusedAsync(Hours("none"), null));
        Assert.Equal("start_time must be HH:mm.", await RefusedAsync(Hours("own", null, "17:00"), null));
        Assert.Equal("Start and end time must differ.", await RefusedAsync(Hours("own", "09:00", "09:00"), null));
        Assert.Equal("pattern.kind must be none, weekdays or cycle.", await RefusedAsync(null, Pattern("Cycle")));
        Assert.Equal("Usual days need at least one weekday.", await RefusedAsync(null, Pattern("weekdays")));
        Assert.Equal(
            "A cycle runs 1 to 28 days on and 1 to 28 days off.",
            await RefusedAsync(null, Pattern("cycle", on: 29, off: 2, from: "2026-11-03")));
        Assert.Equal("from must be yyyy-MM-dd.", await RefusedAsync(null, Pattern("cycle", on: 2, off: 2)));
        Assert.Equal(
            "That date is outside what a roster can hold.",
            await RefusedAsync(null, Pattern("cycle", on: 2, off: 2, from: "1999-12-31")));

        Assert.Equal(0, (await MonthAsync(client, roster, "2026-11")).GetProperty("people").GetArrayLength());
    }

    [Fact]
    public async Task A_person_saved_by_an_older_client_keeps_what_it_did_not_send()
    {
        var (client, _) = await api.SignInAsync("rosterolder");
        int roster = await RosterAsync(client);
        int hookahs = await PositionAsync(client, roster, "Кальяны");
        int person = await MemberAsync(
            client, roster, "Толик", null, Hours("own", "18:00", "02:00"), Pattern("weekdays", [5, 6]));

        async Task<JsonElement> OlderAsync(string? position)
            => await Read(await client.PutAsJsonAsync(
                $"{Rosters}/{roster}/people/{person}", new { name = "Толик", position, colour = "#aabbcc" }));

        void Kept(JsonElement who)
        {
            Assert.Equal("own", who.GetProperty("hours").GetProperty("mode").GetString());
            Assert.Equal("18:00", who.GetProperty("hours").GetProperty("start_time").GetString());
            Assert.Equal([5, 6], who.GetProperty("pattern").GetProperty("weekdays").EnumerateArray().Select(day => day.GetInt32()));
        }

        var linked = await OlderAsync(" кальяны ");

        Assert.Equal(hookahs, linked.GetProperty("position_id").GetInt32());
        Assert.Equal("Кальяны", linked.GetProperty("position").GetString());
        Kept(linked);

        var made = await OlderAsync("Кухня");
        var month = await MonthAsync(client, roster, "2026-11");
        var kitchen = month.GetProperty("positions").EnumerateArray().Single(row => row.GetProperty("name").GetString() == "Кухня");

        Assert.Equal(kitchen.GetProperty("id").GetInt32(), made.GetProperty("position_id").GetInt32());
        Assert.Equal("none", kitchen.GetProperty("hours").GetProperty("mode").GetString());
        Kept(Who(month, person));

        var unlinked = await OlderAsync(null);

        Assert.Equal(JsonValueKind.Null, unlinked.GetProperty("position_id").ValueKind);
        Assert.Equal(JsonValueKind.Null, unlinked.GetProperty("position").ValueKind);
        Kept(Who(await MonthAsync(client, roster, "2026-11"), person));
        Assert.Equal(2, (await MonthAsync(client, roster, "2026-11")).GetProperty("positions").GetArrayLength());
    }

    [Fact]
    public async Task A_new_client_body_ignores_a_stale_position_name()
    {
        var (client, _) = await api.SignInAsync("rosterstale");
        int roster = await RosterAsync(client);
        int hookahs = await PositionAsync(client, roster, "Кальяны");
        int person = await MemberAsync(client, roster, "Толик", hookahs);

        var saved = await Read(await client.PutAsJsonAsync(
            $"{Rosters}/{roster}/people/{person}",
            new
            {
                name = "Толик",
                position = "Кальяны",
                colour = "#aabbcc",
                position_id = (int?)null,
                hours = Inherit,
                pattern = Pattern("none"),
            }));

        Assert.Equal(JsonValueKind.Null, saved.GetProperty("position_id").ValueKind);
        Assert.Equal(JsonValueKind.Null, Who(await MonthAsync(client, roster, "2026-11"), person).GetProperty("position_id").ValueKind);

        // A word nobody has used makes nothing either.
        await Read(await client.PostAsJsonAsync(
            $"{Rosters}/{roster}/people",
            new { name = "Гриша", position = "Кухня", colour = "#aabbcc", position_id = (int?)null, hours = Inherit, pattern = (object?)null }));

        Assert.Equal(["Кальяны"], Names((await MonthAsync(client, roster, "2026-11")).GetProperty("positions")));
    }

    [Fact]
    public async Task An_older_client_cannot_pass_twenty_positions_by_typing_new_words()
    {
        var (client, _) = await api.SignInAsync("rosterolderpos");
        int roster = await RosterAsync(client);

        for (var i = 0; i < 20; i++) await PositionAsync(client, roster, $"Должность {i}");

        int person = await PersonAsync(client, roster, "Толик", "должность 3");

        Assert.Equal(
            "A roster holds at most 20 positions.",
            await RefusalAsync(await client.PostAsJsonAsync(
                $"{Rosters}/{roster}/people", new { name = "Гриша", position = "Двадцать первая", colour = "#aabbcc" })));
        Assert.Equal(
            "A roster holds at most 20 positions.",
            await RefusalAsync(await client.PutAsJsonAsync(
                $"{Rosters}/{roster}/people/{person}", new { name = "Толик", position = "Двадцать первая", colour = "#aabbcc" })));

        var month = await MonthAsync(client, roster, "2026-11");

        Assert.Equal(20, month.GetProperty("positions").GetArrayLength());
        Assert.Equal("Должность 3", Who(month, person).GetProperty("position").GetString());
        Assert.Single(month.GetProperty("people").EnumerateArray());
    }

    [Fact]
    public async Task The_legacy_position_column_follows_the_link()
    {
        var (client, _) = await api.SignInAsync("rosterlegacy");
        int roster = await RosterAsync(client);
        int bar = await PositionAsync(client, roster, "Бар");
        int kitchen = await PositionAsync(client, roster, "Кухня");
        int tolik = await MemberAsync(client, roster, "Толик", bar);
        int grisha = await PersonAsync(client, roster, "Гриша", "кухня");

        Assert.Equal("Бар,Кухня", await LegacyAsync(roster));

        await Read(await client.PutAsJsonAsync(
            $"{Rosters}/{roster}/people/{tolik}",
            new { name = "Толик", colour = "#aabbcc", position_id = kitchen, hours = Inherit, pattern = Pattern("none") }));

        Assert.Equal("Кухня,Кухня", await LegacyAsync(roster));

        await Read(await client.PutAsJsonAsync($"{Rosters}/{roster}/positions/{kitchen}", new { name = "Повара" }));

        Assert.Equal("Повара,Повара", await LegacyAsync(roster));

        await Read(await client.PutAsJsonAsync(
            $"{Rosters}/{roster}/people/{grisha}", new { name = "Гриша", position = (string?)null, colour = "#aabbcc" }));

        Assert.Equal("Повара,-", await LegacyAsync(roster));

        await Read(await client.DeleteAsync($"{Rosters}/{roster}/positions/{kitchen}"));

        Assert.Equal("-,-", await LegacyAsync(roster));
    }

    // ==== Cells with no set time ====

    [Fact]
    public async Task A_cell_with_no_time_reads_back_with_no_hours()
    {
        var (client, _) = await api.SignInAsync("rosterbare");
        int roster = await RosterAsync(client);
        int person = await PersonAsync(client, roster);

        await SetAsync(client, roster, Bare(person, "2026-11-04"), new { person_id = person, date = "2026-11-05" });

        var shifts = (await MonthAsync(client, roster, "2026-11", bare: true)).GetProperty("shifts").EnumerateArray().ToArray();

        Assert.Equal(["2026-11-04", "2026-11-05"], shifts.Select(shift => shift.GetProperty("date").GetString()));
        Assert.All(shifts, shift =>
        {
            Assert.Equal(JsonValueKind.Null, shift.GetProperty("start_time").ValueKind);
            Assert.Equal(JsonValueKind.Null, shift.GetProperty("end_time").ValueKind);
        });

        var rows = await WithDbAsync(db => db.RosterShifts.AsNoTracking().Where(row => row.RosterId == roster).ToArrayAsync());

        Assert.Equal(2, rows.Length);
        Assert.All(rows, row => Assert.True(row.StartTime is null && row.EndTime is null));
    }

    [Fact]
    public async Task A_cell_with_half_its_hours_fails_the_whole_batch()
    {
        var (client, _) = await api.SignInAsync("rosterhalf");
        int roster = await RosterAsync(client);
        int person = await PersonAsync(client, roster);

        foreach (var half in new object[]
        {
            new { person_id = person, date = "2026-11-03", start_time = "11:00" },
            new { person_id = person, date = "2026-11-03", start_time = (string?)null, end_time = "22:00" },
        })
        {
            Assert.Equal(
                "start_time and end_time come together.",
                await RefusalAsync(await CellsAsync(client, roster, [Cell(person, "2026-11-02"), half])));
        }

        Assert.Empty(Dates(await MonthAsync(client, roster, "2026-11", bare: true)));
    }

    [Fact]
    public async Task A_cell_goes_from_hours_to_none_and_back()
    {
        var (client, _) = await api.SignInAsync("rostertoggle");
        int roster = await RosterAsync(client);
        int person = await PersonAsync(client, roster);

        async Task<(string? Start, string? End)> ShiftAsync()
        {
            var shift = (await MonthAsync(client, roster, "2026-11", bare: true)).GetProperty("shifts").EnumerateArray().Single();

            return (shift.GetProperty("start_time").GetString(), shift.GetProperty("end_time").GetString());
        }

        await SetAsync(client, roster, Cell(person, "2026-11-02", "18:00", "02:00"));
        Assert.Equal(("18:00", "02:00"), await ShiftAsync());

        await SetAsync(client, roster, Bare(person, "2026-11-02"));
        Assert.Equal((null, null), await ShiftAsync());

        await SetAsync(client, roster, Cell(person, "2026-11-02", "12:00", "00:00"));
        Assert.Equal(("12:00", "00:00"), await ShiftAsync());
    }

    [Fact]
    public async Task An_older_client_never_reads_a_day_with_no_time()
    {
        var (client, _) = await api.SignInAsync("rosteroldbare");
        int roster = await RosterAsync(client);
        int person = await PersonAsync(client, roster);

        await SetAsync(client, roster, Bare(person, "2026-11-04"), Cell(person, "2026-11-05"));

        Assert.Equal(["2026-11-05"], Dates(await MonthAsync(client, roster, "2026-11")));
        Assert.Equal(["2026-11-04", "2026-11-05"], Dates(await MonthAsync(client, roster, "2026-11", bare: true)));
        Assert.Equal(
            ["2026-11-05"],
            Dates(await Read(await client.GetAsync($"{Rosters}/{roster}/month/2026-11?bare=yes"))));

        // It sees the cell as free, and hours put there replace the day with none.
        await SetAsync(client, roster, Cell(person, "2026-11-04", "12:00", "20:00"));

        Assert.Equal(["2026-11-04", "2026-11-05"], Dates(await MonthAsync(client, roster, "2026-11")));
        Assert.Equal(2, await WithDbAsync(db => db.RosterShifts.CountAsync(row => row.RosterId == roster)));
    }

    // ==== Fill and clear ====

    /// <summary>Before November, so the whole of it is still to come.</summary>
    private static readonly DateTime October = new(2026, 10, 20, 12, 0, 0, DateTimeKind.Utc);

    private static async Task<JsonElement> FillAsync(HttpClient client, int roster, string month)
        => await Read(await client.PostAsJsonAsync($"{Rosters}/{roster}/fill", new { month }));

    private static async Task<JsonElement> ClearAsync(HttpClient client, int roster, string month)
        => await Read(await client.PostAsJsonAsync($"{Rosters}/{roster}/clear", new { month }));

    private static (int Added, int Kept, int Skipped, string? From) Counts(JsonElement filled)
        => (filled.GetProperty("added").GetInt32(),
            filled.GetProperty("kept").GetInt32(),
            filled.GetProperty("skipped").GetInt32(),
            filled.GetProperty("from").GetString());

    /// <summary>Each shift as "person date start-end", "none" for no set time.</summary>
    private static string[] Shifts(JsonElement month) => month.GetProperty("shifts").EnumerateArray()
        .Select(shift =>
            $"{shift.GetProperty("person_id").GetInt32()} {shift.GetProperty("date").GetString()} "
            + $"{shift.GetProperty("start_time").GetString() ?? "none"}-{shift.GetProperty("end_time").GetString() ?? "none"}")
        .ToArray();

    private static readonly object BarHours = Hours("own", "18:00", "02:00", Week(5, "18:00", "04:00"), Week(6, "18:00", "04:00"));

    [Fact]
    public async Task Fill_puts_people_on_their_usual_days_at_their_usual_time()
    {
        await using var host = StoppedHost(October);

        var (client, _) = await api.SignInAsync("rosterfill", host);
        int roster = await RosterAsync(client);

        await Read(await VenueAsync(client, roster, Bar));

        int bar = await PositionAsync(client, roster, "Бар", BarHours);
        int hookahs = await PositionAsync(client, roster, "Кальяны", Hours("venue"));
        int tolik = await MemberAsync(client, roster, "Толик", hookahs, Inherit, Pattern("weekdays", [5, 6, 7]));
        int grisha = await MemberAsync(client, roster, "Гриша", bar, Inherit, Pattern("weekdays", [1]));

        // The shared cases' first fill, and somebody on Mondays at the bar's own hours.
        Assert.Equal((13, 0, 5, "2026-11-01"), Counts(await FillAsync(client, roster, "2026-11")));

        var shifts = Shifts(await MonthAsync(client, roster, "2026-11", bare: true));

        Assert.Equal(
            new[] { 6, 7, 13, 14, 20, 21, 27, 28 }.Select(day => $"{tolik} 2026-11-{day:00} 12:00-02:00"),
            shifts.Where(shift => shift.StartsWith($"{tolik} ")));
        Assert.Equal(
            new[] { 2, 9, 16, 23, 30 }.Select(day => $"{grisha} 2026-11-{day:00} 18:00-02:00"),
            shifts.Where(shift => shift.StartsWith($"{grisha} ")));
    }

    [Fact]
    public async Task Fill_skips_days_the_venue_is_closed_and_counts_them()
    {
        await using var host = StoppedHost(October);

        var (client, _) = await api.SignInAsync("rosterfillshut", host);
        int roster = await RosterAsync(client);

        await Read(await VenueAsync(client, roster, Bar));

        int hookahs = await PositionAsync(client, roster, "Кальяны", Hours("venue"));

        // Own hours would give a Sunday a time; the venue is shut, and a fill
        // never puts anybody on a shut day.
        int own = await MemberAsync(client, roster, "Толик", null, Hours("own", "10:00", "14:00"), Pattern("weekdays", [6, 7]));
        await MemberAsync(client, roster, "Гриша", hookahs, Inherit, Pattern("weekdays", [7]));

        Assert.Equal((4, 0, 10, "2026-11-01"), Counts(await FillAsync(client, roster, "2026-11")));
        Assert.Equal(
            new[] { 7, 14, 21, 28 }.Select(day => $"{own} 2026-11-{day:00} 10:00-14:00"),
            Shifts(await MonthAsync(client, roster, "2026-11", bare: true)));
    }

    [Fact]
    public async Task Fill_in_the_current_month_starts_today_and_says_so()
    {
        await using var host = StoppedHost();

        var (client, _) = await api.SignInAsync("rosterfillnow", host);
        int roster = await RosterAsync(client);
        int person = await MemberAsync(client, roster, "Толик", null, Inherit, Pattern("weekdays", [1, 2, 3, 4, 5, 6, 7]));

        await SetAsync(client, roster, Cell(person, "2026-11-10"));

        // Today is the 17th: fourteen days to come, and the 10th neither kept nor counted.
        Assert.Equal((14, 0, 0, "2026-11-17"), Counts(await FillAsync(client, roster, "2026-11")));

        var month = await MonthAsync(client, roster, "2026-11", bare: true);

        Assert.Equal(
            ["2026-11-10", .. Enumerable.Range(17, 14).Select(day => $"2026-11-{day}")],
            Dates(month));
        Assert.Equal($"{person} 2026-11-10 11:00-22:00", Shifts(month)[0]);
        Assert.Equal($"{person} 2026-11-17 none-none", Shifts(month)[1]);
    }

    [Fact]
    public async Task Fill_refuses_a_month_already_over()
    {
        await using var host = StoppedHost();

        var (client, _) = await api.SignInAsync("rosterfillover", host);
        int roster = await RosterAsync(client);

        await MemberAsync(client, roster, "Толик", null, Inherit, Pattern("weekdays", [1, 2, 3, 4, 5, 6, 7]));

        foreach (var month in new[] { "2026-10", "2000-01" })
        {
            Assert.Equal(
                "That month is over.",
                await RefusalAsync(await client.PostAsJsonAsync($"{Rosters}/{roster}/fill", new { month })));
        }

        Assert.Empty(Dates(await MonthAsync(client, roster, "2026-10", bare: true)));
    }

    [Fact]
    public async Task Fill_keeps_a_filled_cell_and_a_second_press_adds_nothing()
    {
        await using var host = StoppedHost(October);

        var (client, _) = await api.SignInAsync("rosterfillkeep", host);
        int roster = await RosterAsync(client);

        await Read(await VenueAsync(client, roster, Bar));

        int hookahs = await PositionAsync(client, roster, "Кальяны", Hours("venue"));
        int person = await MemberAsync(client, roster, "Толик", hookahs, Inherit, Pattern("weekdays", [5, 6, 7]));

        await SetAsync(client, roster, Cell(person, "2026-11-06", "10:00", "18:00"), Bare(person, "2026-11-08"));

        // The shared cases' second fill: the Sunday already there counts as kept, not skipped.
        Assert.Equal((7, 2, 4, "2026-11-01"), Counts(await FillAsync(client, roster, "2026-11")));
        Assert.Equal((0, 9, 4, "2026-11-01"), Counts(await FillAsync(client, roster, "2026-11")));

        var shifts = Shifts(await MonthAsync(client, roster, "2026-11", bare: true));

        Assert.Contains($"{person} 2026-11-06 10:00-18:00", shifts);
        Assert.Contains($"{person} 2026-11-08 none-none", shifts);
        Assert.Equal(9, shifts.Length);
    }

    [Fact]
    public async Task Fill_with_nobody_on_usual_days_adds_nothing()
    {
        await using var host = StoppedHost(October);

        var (client, _) = await api.SignInAsync("rosterfillnone", host);
        int roster = await RosterAsync(client);

        await PersonAsync(client, roster, "Толик");
        await MemberAsync(client, roster, "Гриша", null);

        Assert.Equal((0, 0, 0, "2026-11-01"), Counts(await FillAsync(client, roster, "2026-11")));
        Assert.Empty(Dates(await MonthAsync(client, roster, "2026-11", bare: true)));
    }

    [Fact]
    public async Task Fill_refuses_a_month_that_is_not_one()
    {
        var (client, _) = await api.SignInAsync("rosterfillmon");
        int roster = await RosterAsync(client);

        foreach (var month in new[] { "abc", "2026-13", "0001-01", "9999-12" })
        {
            foreach (var verb in new[] { "fill", "clear" })
            {
                Assert.Equal(
                    "month must be yyyy-MM.",
                    await RefusalAsync(await client.PostAsJsonAsync($"{Rosters}/{roster}/{verb}", new { month })));
            }
        }
    }

    [Fact]
    public async Task Fill_racing_cell_saves_is_never_a_500()
    {
        await using var host = StoppedHost(October);

        var (client, _) = await api.SignInAsync("rosterfillrace", host);
        int roster = await RosterAsync(client);
        int[] people = new int[3];

        for (var i = 0; i < people.Length; i++)
            people[i] = await MemberAsync(client, roster, $"Человек {i}", null, Inherit, Pattern("weekdays", [1, 2, 3, 4, 5, 6, 7]));

        var answers = await AtOnceAsync(12, i => i % 2 == 0
            ? client.PostAsJsonAsync($"{Rosters}/{roster}/fill", new { month = "2026-11" })
            : CellsAsync(
                client,
                roster,
                Enumerable.Range(1, 30)
                    .Where(day => day % 6 == i % 6)
                    .Select(day => Cell(people[i % 3], $"2026-11-{day:00}", "12:00", "20:00"))
                    .ToArray()));

        Assert.DoesNotContain(HttpStatusCode.InternalServerError, answers);
        Assert.All(answers, answer => Assert.True(answer is HttpStatusCode.OK or HttpStatusCode.NoContent, $"{answer}"));

        // Every usual day ends up filled once, by whichever got there first.
        var shifts = (await MonthAsync(client, roster, "2026-11", bare: true)).GetProperty("shifts").EnumerateArray()
            .Select(shift => (shift.GetProperty("person_id").GetInt32(), shift.GetProperty("date").GetString()))
            .ToArray();

        Assert.Equal(90, shifts.Length);
        Assert.Equal(90, shifts.Distinct().Count());
    }

    /// <summary>Somebody removed while a fill writes their days: the fill leaves them out, rather than meeting the foreign key they took with them.</summary>
    [Fact]
    public async Task Fill_racing_people_being_removed_is_never_a_500()
    {
        await using var host = StoppedHost(October);

        var (client, _) = await api.SignInAsync("rosterfilldel", host);
        int roster = await RosterAsync(client);
        int[] people = new int[60];

        for (var i = 0; i < people.Length; i++)
            people[i] = await MemberAsync(client, roster, $"Человек {i}", null, Inherit, Pattern("weekdays", [1, 2, 3, 4, 5, 6, 7]));

        // Two in three go while the fill runs; the fill goes out in the middle of them.
        var answers = await AtOnceAsync(41, i => i == 20
            ? client.PostAsJsonAsync($"{Rosters}/{roster}/fill", new { month = "2026-11" })
            : client.DeleteAsync($"{Rosters}/{roster}/people/{people[i < 20 ? i : i - 1]}"));

        Assert.All(answers, answer => Assert.True(answer is HttpStatusCode.OK or HttpStatusCode.NoContent, $"{answer}"));

        // Whoever stayed has every day of the month, and nobody who left has any.
        var month = await MonthAsync(client, roster, "2026-11", bare: true);
        var stayed = month.GetProperty("people").EnumerateArray().Select(row => row.GetProperty("id").GetInt32()).ToArray();

        Assert.Equal(people[40..], stayed);
        Assert.Equal(20 * 30, month.GetProperty("shifts").GetArrayLength());
        Assert.Equal(20 * 30, await WithDbAsync(db => db.RosterShifts.CountAsync(row => row.RosterId == roster)));
    }

    /// <summary>A roster deleted while a fill writes its month: one goes first and the other finds it done.</summary>
    [Fact]
    public async Task Fill_racing_the_roster_being_deleted_is_never_a_500()
    {
        await using var host = StoppedHost(October);

        var (client, _) = await api.SignInAsync("rosterfillgone", host);

        // The delete goes out a little later each round, so one of them lands
        // in the middle of the fill's write.
        for (var round = 0; round < 8; round++)
        {
            int roster = await RosterAsync(client, $"Уходит {round}");

            for (var i = 0; i < 40; i++)
                await MemberAsync(client, roster, $"Человек {i}", null, Inherit, Pattern("weekdays", [1, 2, 3, 4, 5, 6, 7]));

            var filled = client.PostAsJsonAsync($"{Rosters}/{roster}/fill", new { month = "2026-11" });

            await Task.Delay(round);

            var deleted = await client.DeleteAsync($"{Rosters}/{roster}");
            var answer = await filled;

            Assert.True(answer.StatusCode is HttpStatusCode.OK or HttpStatusCode.NotFound, $"round {round}, fill: {(int)answer.StatusCode}");
            Assert.Equal(HttpStatusCode.NoContent, deleted.StatusCode);
            Assert.Equal(0, await WithDbAsync(db => db.RosterShifts.CountAsync(row => row.RosterId == roster)));
        }
    }

    [Fact]
    public async Task Clear_takes_off_the_month_from_today_and_keeps_the_days_before()
    {
        await using var host = StoppedHost();

        var (client, _) = await api.SignInAsync("rosterclear", host);
        int roster = await RosterAsync(client);
        int person = await PersonAsync(client, roster);

        await SetAsync(
            client,
            roster,
            Cell(person, "2026-11-10"),
            Bare(person, "2026-11-17"),
            Cell(person, "2026-11-30"),
            Cell(person, "2026-12-01"));

        var cleared = await ClearAsync(client, roster, "2026-11");

        Assert.Equal(2, cleared.GetProperty("cleared").GetInt32());
        Assert.Equal("2026-11-17", cleared.GetProperty("from").GetString());
        Assert.Equal(["2026-11-10"], Dates(await MonthAsync(client, roster, "2026-11", bare: true)));
        Assert.Equal(["2026-12-01"], Dates(await MonthAsync(client, roster, "2026-12", bare: true)));

        var next = await ClearAsync(client, roster, "2026-12");

        Assert.Equal(1, next.GetProperty("cleared").GetInt32());
        Assert.Equal("2026-12-01", next.GetProperty("from").GetString());
        Assert.Equal(0, (await ClearAsync(client, roster, "2026-12")).GetProperty("cleared").GetInt32());
    }

    [Fact]
    public async Task Clear_refuses_a_month_already_over()
    {
        await using var host = StoppedHost();

        var (client, _) = await api.SignInAsync("rosterclearold", host);
        int roster = await RosterAsync(client);
        int person = await PersonAsync(client, roster);

        await SetAsync(client, roster, Cell(person, "2026-10-05"));

        Assert.Equal(
            "That month is over.",
            await RefusalAsync(await client.PostAsJsonAsync($"{Rosters}/{roster}/clear", new { month = "2026-10" })));
        Assert.Equal(["2026-10-05"], Dates(await MonthAsync(client, roster, "2026-10")));
    }

    // ==== Restamp ====

    [Fact]
    public async Task Later_venue_hours_move_the_shifts_to_come_that_sat_at_the_old_ones()
    {
        await using var host = StoppedHost();

        var (client, _) = await api.SignInAsync("rosterrsvenue", host);
        int roster = await RosterAsync(client);

        await Read(await VenueAsync(client, roster, Bar));

        int person = await MemberAsync(client, roster, "Толик", null);

        await SetAsync(
            client,
            roster,
            Cell(person, "2026-11-13", "12:00", "02:00"),
            Cell(person, "2026-11-20", "12:00", "02:00"),
            Cell(person, "2026-11-27", "14:00", "02:00"),
            Cell(person, "2026-11-21", "12:00", "02:00"),
            Bare(person, "2026-11-23"));

        object[] lateFriday = [.. Bar.Take(4), Week(5, "12:00", "04:00"), Bar[5]];

        var saved = await Read(await VenueAsync(client, roster, lateFriday));

        Assert.Equal(1, saved.GetProperty("restamped").GetInt32());
        Assert.Equal(
            [
                $"{person} 2026-11-13 12:00-02:00",
                $"{person} 2026-11-20 12:00-04:00",
                $"{person} 2026-11-21 12:00-02:00",
                $"{person} 2026-11-23 none-none",
                $"{person} 2026-11-27 14:00-02:00",
            ],
            Shifts(await MonthAsync(client, roster, "2026-11", bare: true)));
    }

    [Fact]
    public async Task A_position_with_new_hours_moves_its_people_and_leaves_hand_set_days()
    {
        await using var host = StoppedHost();

        var (client, _) = await api.SignInAsync("rosterrspos", host);
        int roster = await RosterAsync(client);

        await Read(await VenueAsync(client, roster, Bar));

        int bar = await PositionAsync(client, roster, "Бар", BarHours);
        int hookahs = await PositionAsync(client, roster, "Кальяны", Hours("venue"));
        int tolik = await MemberAsync(client, roster, "Толик", bar);
        int grisha = await MemberAsync(client, roster, "Гриша", hookahs);

        await SetAsync(
            client,
            roster,
            Cell(tolik, "2026-11-23", "18:00", "02:00"),
            Cell(tolik, "2026-11-20", "18:00", "04:00"),
            Cell(tolik, "2026-11-24", "15:00", "23:00"),
            Cell(grisha, "2026-11-23", "12:00", "00:00"));

        var saved = await Read(await client.PutAsJsonAsync(
            $"{Rosters}/{roster}/positions/{bar}",
            new { name = "Бар", hours = Hours("own", "19:00", "03:00", Week(5, "18:00", "04:00"), Week(6, "18:00", "04:00")) }));

        Assert.Equal(1, saved.GetProperty("restamped").GetInt32());
        Assert.Equal("19:00", saved.GetProperty("hours").GetProperty("start_time").GetString());
        Assert.Equal(
            [
                $"{tolik} 2026-11-20 18:00-04:00",
                $"{tolik} 2026-11-23 19:00-03:00",
                $"{grisha} 2026-11-23 12:00-00:00",
                $"{tolik} 2026-11-24 15:00-23:00",
            ],
            Shifts(await MonthAsync(client, roster, "2026-11", bare: true)));
    }

    [Fact]
    public async Task Moving_a_person_to_another_position_moves_their_shifts_from_today()
    {
        await using var host = StoppedHost();

        var (client, _) = await api.SignInAsync("rosterrsmove", host);
        int roster = await RosterAsync(client);

        await Read(await VenueAsync(client, roster, Bar));

        int bar = await PositionAsync(client, roster, "Бар", BarHours);
        int hookahs = await PositionAsync(client, roster, "Кальяны", Hours("venue"));
        int person = await MemberAsync(client, roster, "Толик", hookahs);

        await SetAsync(
            client,
            roster,
            Cell(person, "2026-11-16", "12:00", "00:00"),
            Cell(person, "2026-11-18", "15:00", "23:00"),
            Cell(person, "2026-11-20", "12:00", "02:00"),
            Bare(person, "2026-11-22"),
            Cell(person, "2026-11-23", "12:00", "00:00"));

        var saved = await Read(await client.PutAsJsonAsync(
            $"{Rosters}/{roster}/people/{person}",
            new { name = "Толик", colour = "#1f3a5f", position_id = bar, hours = Inherit, pattern = Pattern("none") }));

        Assert.Equal(2, saved.GetProperty("restamped").GetInt32());
        Assert.Equal(bar, saved.GetProperty("position_id").GetInt32());
        Assert.Equal(
            [
                $"{person} 2026-11-16 12:00-00:00",
                $"{person} 2026-11-18 15:00-23:00",
                $"{person} 2026-11-20 18:00-04:00",
                $"{person} 2026-11-22 none-none",
                $"{person} 2026-11-23 18:00-02:00",
            ],
            Shifts(await MonthAsync(client, roster, "2026-11", bare: true)));
    }

    [Fact]
    public async Task Deleting_a_position_moves_its_people_to_what_is_left_for_them()
    {
        await using var host = StoppedHost();

        var (client, _) = await api.SignInAsync("rosterrsdel", host);
        int roster = await RosterAsync(client);

        await Read(await VenueAsync(client, roster, Bar));

        int bar = await PositionAsync(client, roster, "Бар", BarHours);
        int tolik = await MemberAsync(client, roster, "Толик", bar);
        int grisha = await MemberAsync(client, roster, "Гриша", null);

        await SetAsync(
            client,
            roster,
            Cell(tolik, "2026-11-21", "18:00", "04:00"),
            Cell(tolik, "2026-11-23", "18:00", "02:00"),
            Cell(tolik, "2026-11-25", "10:00", "20:00"),
            Cell(grisha, "2026-11-23", "12:00", "00:00"));

        var deleted = await Read(await client.DeleteAsync($"{Rosters}/{roster}/positions/{bar}"));

        Assert.Equal(2, deleted.GetProperty("restamped").GetInt32());
        Assert.Equal(
            [
                $"{tolik} 2026-11-21 12:00-02:00",
                $"{tolik} 2026-11-23 12:00-00:00",
                $"{grisha} 2026-11-23 12:00-00:00",
                $"{tolik} 2026-11-25 10:00-20:00",
            ],
            Shifts(await MonthAsync(client, roster, "2026-11", bare: true)));
    }

    [Fact]
    public async Task A_restamp_never_touches_a_day_with_no_time_or_a_day_gone_by()
    {
        await using var host = StoppedHost();

        var (client, _) = await api.SignInAsync("rosterrskeep", host);
        int roster = await RosterAsync(client);

        await Read(await VenueAsync(client, roster, Bar));

        int person = await MemberAsync(client, roster, "Толик", null);

        await SetAsync(
            client,
            roster,
            Cell(person, "2026-11-16", "12:00", "00:00"),
            Bare(person, "2026-11-23"),
            Cell(person, "2026-11-30", "12:00", "00:00"));

        object[] laterMonday = [Week(1, "14:00", "00:00"), .. Bar.Skip(1)];

        Assert.Equal(1, (await Read(await VenueAsync(client, roster, laterMonday))).GetProperty("restamped").GetInt32());

        var saved = await Read(await client.PutAsJsonAsync(
            $"{Rosters}/{roster}/people/{person}",
            new { name = "Толик", colour = "#1f3a5f", position_id = (int?)null, hours = Hours("own", "16:00", "02:00"), pattern = Pattern("none") }));

        Assert.Equal(1, saved.GetProperty("restamped").GetInt32());
        Assert.Equal(
            [
                $"{person} 2026-11-16 12:00-00:00",
                $"{person} 2026-11-23 none-none",
                $"{person} 2026-11-30 16:00-02:00",
            ],
            Shifts(await MonthAsync(client, roster, "2026-11", bare: true)));
    }

    // ==== Repeat ====

    [Fact]
    public async Task Repeat_copies_a_day_with_no_time()
    {
        var (client, _) = await api.SignInAsync("rosterrepbare");
        int roster = await RosterAsync(client);
        int person = await PersonAsync(client, roster);

        await SetAsync(client, roster, Bare(person, "2026-10-05"), Cell(person, "2026-10-06", "12:00", "20:00"));

        var repeated = await Read(await client.PostAsJsonAsync($"{Rosters}/{roster}/repeat", new { month = "2026-11" }));

        Assert.Equal(2, repeated.GetProperty("added").GetInt32());
        Assert.Equal(
            [$"{person} 2026-11-02 none-none", $"{person} 2026-11-03 12:00-20:00"],
            Shifts(await MonthAsync(client, roster, "2026-11", bare: true)));
        Assert.Equal(["2026-11-03"], Dates(await MonthAsync(client, roster, "2026-11")));
    }

    /// <summary>Another tab saving cells into the month being repeated: a cell it saved first is one repeat keeps, never a 500.</summary>
    [Fact]
    public async Task Repeat_racing_cell_saves_is_never_a_500()
    {
        var (client, _) = await api.SignInAsync("rosterreprace");
        int roster = await RosterAsync(client);
        int[] people = new int[8];

        for (var i = 0; i < people.Length; i++) people[i] = await PersonAsync(client, roster, $"Человек {i}", null);

        // The whole of November, so every day of December has a day to come from.
        await SetAsync(
            client,
            roster,
            people.SelectMany(person => Enumerable.Range(1, 30).Select(day => Cell(person, $"2100-11-{day:00}"))).ToArray());

        for (var round = 0; round < 6; round++)
        {
            await ClearAsync(client, roster, "2100-12");

            // Cell saves keep landing for as long as the repeat is under way, so
            // some take cells between its read and its write. Each names its
            // cells backwards, as a client may; the server writes in one order.
            var repeated = client.PostAsJsonAsync($"{Rosters}/{roster}/repeat", new { month = "2100-12" });
            var saves = new List<Task<HttpResponseMessage>>();

            for (var i = 0; !repeated.IsCompleted && i < 200; i++)
            {
                saves.Add(CellsAsync(
                    client,
                    roster,
                    people
                        .Where(person => (person + i) % 2 == 0)
                        .Reverse()
                        .Select(person => Cell(person, $"2100-12-{(person * 7 + i * 3) % 31 + 1:00}", "12:00", "20:00"))
                        .ToArray()));

                await Task.Delay(1);
            }

            var answer = await repeated;

            Assert.All(await Task.WhenAll(saves), save => Assert.Equal(HttpStatusCode.NoContent, save.StatusCode));

            // What it added and what it found filled, the cells saved beside it
            // included, are the whole month between them.
            var counts = await Read(answer);

            Assert.Equal(8 * 31, counts.GetProperty("added").GetInt32() + counts.GetProperty("kept").GetInt32());

            var shifts = (await MonthAsync(client, roster, "2100-12")).GetProperty("shifts").EnumerateArray()
                .Select(shift => (shift.GetProperty("person_id").GetInt32(), shift.GetProperty("date").GetString()))
                .ToArray();

            Assert.Equal(8 * 31, shifts.Length);
            Assert.Equal(8 * 31, shifts.Distinct().Count());
        }
    }

    // ==== The page, with positions, venue hours and days with no time ====

    [Fact]
    public async Task The_page_shows_positions_as_groups_the_venue_line_closed_days_and_days_with_no_time()
    {
        await using var host = StoppedHost();

        var (client, _) = await api.SignInAsync("rosterpagegrp", host);
        int roster = await RosterAsync(client);

        await Read(await VenueAsync(client, roster, Bar));

        int hookahs = await PositionAsync(client, roster, "Кальяны", Hours("venue"));
        int bar = await PositionAsync(client, roster, "Бар", BarHours);

        // Made first, listed last: nobody's place in the list is their id alone.
        int zhenya = await MemberAsync(client, roster, "Женя", null);
        int tolik = await MemberAsync(client, roster, "Толик", hookahs);
        int grisha = await MemberAsync(client, roster, "Гриша", bar);

        await SetAsync(
            client,
            roster,
            Cell(tolik, "2026-11-02", "12:00", "00:00"),
            Bare(grisha, "2026-11-03"),
            Cell(zhenya, "2026-11-08", "11:00", "22:00"));

        string slug = await ShareAsync(client, roster);
        string page = WebUtility.HtmlDecode(await PageAsync(host.CreateClient(), $"/r/{slug}?month=2026-11"));

        // Each run of days kept whole, its dot at the end of the one before,
        // so a narrow phone breaks the line after a dot and never after «Пт–».
        Assert.Contains(
            "<p class=\"month\">Ноябрь 2026</p>\n<p class=\"venue\">Часы работы: "
            + "<span>Пн–Чт 12:00–00:00 ·</span> <span>Пт–Сб 12:00–02:00 ·</span> <span>Вс закрыто</span></p>",
            page.Replace("\r", ""));
        Assert.Contains(".venue span{white-space:nowrap}", page);

        int first = page.IndexOf("<th scope=\"rowgroup\" class=\"who\">Кальяны</th>", StringComparison.Ordinal);
        int second = page.IndexOf("<th scope=\"rowgroup\" class=\"who\">Бар</th>", StringComparison.Ordinal);
        int last = page.IndexOf("<th scope=\"rowgroup\" class=\"who\">Без должности</th>", StringComparison.Ordinal);

        Assert.True(first >= 0 && first < page.IndexOf(">Толик</th>", StringComparison.Ordinal), page);
        Assert.True(page.IndexOf(">Толик</th>", StringComparison.Ordinal) < second, page);
        Assert.True(second < page.IndexOf(">Гриша</th>", StringComparison.Ordinal), page);
        Assert.True(page.IndexOf(">Гриша</th>", StringComparison.Ordinal) < last, page);
        Assert.True(last < page.IndexOf(">Женя</th>", StringComparison.Ordinal), page);
        Assert.Contains("<tr class=\"group\"><th scope=\"rowgroup\" class=\"who\">Бар</th><td colspan=\"30\"></td></tr>", page);

        // Sundays are shut, in the head and down the column.
        Assert.Contains("<th scope=\"col\" class=\"we shut\"><small>вс</small>1</th>", page);
        Assert.Contains("<th scope=\"col\" class=\"we shut\"><small>вс</small>8</th>", page);
        Assert.Contains("<th scope=\"col\" class=\"we\"><small>сб</small>7</th>", page);
        Assert.Contains("<td class=\"we shut\" style=\"background-color:#1f3a5f33\">11-22</td>", page);

        // A day with no time is a dot, and words only a screen reader says.
        Assert.Contains(
            "<td style=\"background-color:#1f3a5f33\"><i class=\"bare\" style=\"background:#1f3a5f\"></i><span class=\"sr\">без времени</span></td>",
            page);

        var phone = Phone(page);

        Assert.Contains("<section class=\"day shut\"><h2>вс, 8 ноября · закрыто</h2>", phone);
        Assert.Contains("<li class=\"group\">Без должности</li><li class=\"person\">", phone);
        Assert.Contains("<li class=\"group\">Кальяны</li>", phone);
        Assert.Contains("<b>Гриша</b><span class=\"hours\"><span class=\"sr\">без времени</span></span>", phone);
        Assert.Contains("<b>Толик</b><span class=\"hours\">12-24</span>", phone);
        Assert.DoesNotContain("<section class=\"day shut\"><h2>пн", phone);

        Assert.DoesNotContain("<small>Кальяны</small>", page);
        Assert.DoesNotContain("class=\"post\"", page);
    }

    [Fact]
    public async Task A_ukrainian_reader_gets_the_venue_line_and_no_time_in_ukrainian()
    {
        await using var host = StoppedHost();

        var (client, _) = await api.SignInAsync("rosterpageuk", host);
        int roster = await RosterAsync(client);

        await Read(await VenueAsync(client, roster, Bar));

        int hookahs = await PositionAsync(client, roster, "Кальяни", Hours("venue"));
        int tolik = await MemberAsync(client, roster, "Толік", hookahs);
        int zhenya = await MemberAsync(client, roster, "Женя", null);

        await SetAsync(client, roster, Bare(tolik, "2026-11-03"), Cell(zhenya, "2026-11-22", "11:00", "22:00"));

        string slug = await ShareAsync(client, roster);
        string page = WebUtility.HtmlDecode(await PageAsync(host.CreateClient(), $"/r/{slug}?month=2026-11", "uk-UA,uk;q=0.9"));

        Assert.Contains(
            "<p class=\"venue\">Години роботи: <span>Пн–Чт 12:00–00:00 ·</span> <span>Пт–Сб 12:00–02:00 ·</span> <span>Нд зачинено</span></p>",
            page);
        Assert.Contains("<i class=\"bare\" style=\"background:#1f3a5f\"></i><span class=\"sr\">без часу</span></td>", page);
        Assert.Contains("<th scope=\"rowgroup\" class=\"who\">Без посади</th>", page);
        Assert.Contains("<li class=\"group\">Без посади</li>", Phone(page));
        Assert.Contains("<h2>нд, 22 листопада · зачинено</h2>", Phone(page));
        Assert.Contains("<span class=\"hours\"><span class=\"sr\">без часу</span></span>", Phone(page));
        Assert.DoesNotContain("без времени", page);
        Assert.DoesNotContain("закрыто", page);
    }

    [Fact]
    public async Task The_page_lists_days_with_no_time_after_the_timed_ones()
    {
        await using var host = StoppedHost();

        var (client, _) = await api.SignInAsync("rosterpagebare", host);
        int roster = await RosterAsync(client);
        int first = await PersonAsync(client, roster, "Аня", null);
        int second = await PersonAsync(client, roster, "Боря", null);
        int third = await PersonAsync(client, roster, "Вера", null);
        int fourth = await PersonAsync(client, roster, "Гена", null);

        await SetAsync(
            client,
            roster,
            Bare(first, "2026-11-18"),
            Cell(second, "2026-11-18", "14:00", "22:00"),
            Cell(third, "2026-11-18", "10:00", "22:00"),
            Bare(fourth, "2026-11-18"));

        string slug = await ShareAsync(client, roster);
        var phone = Phone(await PageAsync(host.CreateClient(), $"/r/{slug}"));

        int[] order = new[] { "<b>Вера</b>", "<b>Боря</b>", "<b>Аня</b>", "<b>Гена</b>" }
            .Select(name => phone.IndexOf(name, StringComparison.Ordinal))
            .ToArray();

        Assert.All(order, at => Assert.True(at >= 0, phone));
        Assert.Equal(order.Order(), order);
    }

    [Fact]
    public async Task The_page_without_positions_has_no_group_rows()
    {
        var (client, _) = await api.SignInAsync("rosterpageno");
        int roster = await RosterAsync(client);
        int person = await PersonAsync(client, roster, "Толик", null);

        await SetAsync(client, roster, Cell(person, "2026-10-05"));

        string slug = await ShareAsync(client, roster);
        string page = await PageAsync(api.CreateClient(), $"/r/{slug}?month=2026-10");

        Assert.DoesNotContain("class=\"group\"", page);
        Assert.DoesNotContain("Без должности", page);
        Assert.DoesNotContain("class=\"venue\"", page);
        Assert.DoesNotContain("shut\"", page);
        Assert.Contains("<tr><th scope=\"row\" class=\"who\">", page);
    }

    [Fact]
    public async Task A_position_name_holding_markup_comes_out_escaped()
    {
        var (client, _) = await api.SignInAsync("rosterposesc");
        int roster = await RosterAsync(client);
        int position = await PositionAsync(client, roster, "<b>x</b>\"'");
        int person = await MemberAsync(client, roster, "Толик", position);

        await SetAsync(client, roster, Cell(person, "2026-10-05"));

        string slug = await ShareAsync(client, roster);
        string page = await PageAsync(api.CreateClient(), $"/r/{slug}?month=2026-10");

        Assert.DoesNotContain("<b>x</b>", page);
        Assert.Contains("<th scope=\"rowgroup\" class=\"who\">&lt;b&gt;x&lt;/b&gt;&quot;&#39;</th>", page);
        Assert.Contains("<li class=\"group\">&lt;b&gt;x&lt;/b&gt;&quot;&#39;</li>", Phone(page));
    }

    // ==== Rows from before the migration ====

    [Fact]
    public async Task A_roster_from_before_positions_reads_like_any_other()
    {
        await using var host = StoppedHost(October);

        var (client, login) = await api.SignInAsync("rosterlegrows", host);
        int roster = await RosterAsync(client);
        int position = await PositionAsync(client, roster, "Бар", BarHours);
        int person = await MemberAsync(
            client, roster, "Толик", position, Hours("own", "18:00", "02:00", Week(5, "18:00", "04:00")), Pattern("weekdays", [5]));

        await Read(await VenueAsync(client, roster, Bar));
        await SetAsync(client, roster, Cell(person, "2026-11-02"));

        string slug = await ShareAsync(client, roster);

        // What the release before this one leaves behind: the JSON columns it
        // never heard of, NULL.
        await WithDbAsync(async db =>
        {
            await db.Database.ExecuteSqlInterpolatedAsync($"""UPDATE "Rosters" SET "VenueHours" = NULL WHERE "Id" = {roster}""");
            await db.Database.ExecuteSqlInterpolatedAsync($"""UPDATE "RosterPeople" SET "WeekHours" = NULL WHERE "RosterId" = {roster}""");

            return await db.Database.ExecuteSqlInterpolatedAsync(
                $"""UPDATE "RosterPositions" SET "WeekHours" = NULL WHERE "RosterId" = {roster}""");
        });

        var listed = (await Read(await client.GetAsync(Rosters))).EnumerateArray().Single();

        Assert.Equal(0, listed.GetProperty("venue_hours").GetArrayLength());
        Assert.Equal(0, listed.GetProperty("positions")[0].GetProperty("hours").GetProperty("week_hours").GetArrayLength());
        Assert.Equal(0, listed.GetProperty("people")[0].GetProperty("hours").GetProperty("week_hours").GetArrayLength());

        var month = await MonthAsync(client, roster, "2026-11", bare: true);

        Assert.Equal(0, month.GetProperty("venue_hours").GetArrayLength());
        Assert.Equal(["2026-11-02"], Dates(month));

        Assert.Contains("Толик", await PageAsync(host.CreateClient(), $"/r/{slug}?month=2026-11"));

        // No venue hours left: every Friday is open, at the person's own time.
        Assert.Equal((4, 0, 0, "2026-11-01"), Counts(await FillAsync(client, roster, "2026-11")));

        Assert.Equal(HttpStatusCode.OK, (await client.GetAsync("/shifter/v1/account/export")).StatusCode);
        Assert.NotNull(login);
    }

    // ==== Leaving things, and taking them away ====

    [Fact]
    public async Task The_takeout_carries_positions_venue_hours_usual_days_and_days_with_no_time()
    {
        var (client, _) = await api.SignInAsync("rostertakenew");
        int roster = await RosterAsync(client, "Мой график");

        await Read(await VenueAsync(client, roster, [Week(1, "12:00", "00:00")]));

        int barman = await PositionAsync(client, roster, "Бармен", Hours("own", "18:00", "02:00", Week(5, "18:00", "04:00")));
        await PositionAsync(client, roster, "Кальяны");

        int tolik = await MemberAsync(client, roster, "Толик", barman, Inherit, Pattern("cycle", on: 2, off: 2, from: "2026-11-03"));
        await MemberAsync(
            client, roster, "Гриша", null, Hours("own", "09:00", "17:00", Week(6, "10:00", "15:00")), Pattern("weekdays", [3, 1]));

        await SetAsync(client, roster, Cell(tolik, "2026-11-02", "22:00", "06:00"), Bare(tolik, "2026-11-03"));

        string slug = await ShareAsync(client, roster);

        var response = await client.GetAsync("/shifter/v1/account/export");

        response.EnsureSuccessStatusCode();

        using var zip = new ZipArchive(
            new MemoryStream(await response.Content.ReadAsByteArrayAsync()),
            ZipArchiveMode.Read);

        using var reader = new StreamReader(zip.GetEntry("rosters.json")!.Open());

        var text = await reader.ReadToEndAsync();
        var kept = JsonDocument.Parse(text).RootElement.EnumerateArray().Single();

        Assert.Equal("Мой график", kept.GetProperty("title").GetString());

        var venue = kept.GetProperty("venue_hours").EnumerateArray().Single();

        Assert.Equal((1, "12:00", "00:00"), (venue.GetProperty("weekday").GetInt32(), venue.GetProperty("start").GetString(), venue.GetProperty("end").GetString()));

        var positions = kept.GetProperty("positions");

        Assert.Equal(["Бармен", "Кальяны"], Names(positions));

        var own = positions[0].GetProperty("hours");

        Assert.Equal(("own", "18:00", "02:00"), (own.GetProperty("mode").GetString(), own.GetProperty("start").GetString(), own.GetProperty("end").GetString()));
        Assert.Equal("04:00", own.GetProperty("week_hours")[0].GetProperty("end").GetString());
        Assert.Equal("none", positions[1].GetProperty("hours").GetProperty("mode").GetString());
        Assert.Equal(JsonValueKind.Null, positions[1].GetProperty("hours").GetProperty("start").ValueKind);

        var people = kept.GetProperty("people");
        var first = people[0];

        Assert.Equal("Бармен", first.GetProperty("position").GetString());
        Assert.Equal(JsonValueKind.Null, first.GetProperty("hours").ValueKind);
        Assert.Equal("cycle", first.GetProperty("pattern").GetProperty("kind").GetString());
        Assert.Equal("2026-11-03", first.GetProperty("pattern").GetProperty("from").GetString());

        var shifts = first.GetProperty("shifts");

        Assert.Equal(2, shifts.GetArrayLength());
        Assert.Equal("22:00", shifts[0].GetProperty("start").GetString());
        Assert.Equal("2026-11-03", shifts[1].GetProperty("date").GetString());
        Assert.Equal(JsonValueKind.Null, shifts[1].GetProperty("start").ValueKind);
        Assert.Equal(JsonValueKind.Null, shifts[1].GetProperty("end").ValueKind);

        var second = people[1];

        Assert.Equal(JsonValueKind.Null, second.GetProperty("position").ValueKind);
        Assert.Equal("09:00", second.GetProperty("hours").GetProperty("start").GetString());
        Assert.Equal(6, second.GetProperty("hours").GetProperty("week_hours")[0].GetProperty("weekday").GetInt32());
        Assert.Equal([1, 3], second.GetProperty("pattern").GetProperty("weekdays").EnumerateArray().Select(day => day.GetInt32()));

        Assert.DoesNotContain(slug, text);
    }

    [Fact]
    public async Task Deleting_a_roster_removes_its_positions()
    {
        var (client, _) = await api.SignInAsync("rosterdelpos");
        int roster = await RosterAsync(client);
        int position = await PositionAsync(client, roster, "Бар");

        await MemberAsync(client, roster, "Толик", position);

        Assert.Equal(1, await WithDbAsync(db => db.RosterPositions.CountAsync(row => row.RosterId == roster)));
        Assert.Equal(HttpStatusCode.NoContent, (await client.DeleteAsync($"{Rosters}/{roster}")).StatusCode);
        Assert.Equal(0, await WithDbAsync(db => db.RosterPositions.CountAsync(row => row.RosterId == roster)));
        Assert.Equal(0, await WithDbAsync(db => db.RosterPeople.CountAsync(row => row.RosterId == roster)));
    }
}
