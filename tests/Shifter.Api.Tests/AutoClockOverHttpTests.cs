using System.IO.Compression;
using System.Net.Http.Json;
using System.Text.Json;

using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

using Shifter.Application.Common.Time;
using Shifter.Application.Features.business.Services;
using Shifter.Application.Features.Telegram;
using Shifter.Application.Features.Webhooks.Services;
using Shifter.Domain.Entities;
using Shifter.Infrastructure.Persistence.DbContexts;
using Shifter.Infrastructure.Repositories.Interfaces;

using Xunit;

namespace Shifter.Api.Tests;

/// <summary>Weekday hours and the shift that closes itself, against the real Postgres.</summary>
[Collection("api")]
public sealed class AutoClockOverHttpTests(Api api)
{
    // Far enough ahead that nothing else in the run has a day near them: the
    // pass sweeps every account, and each test here picks its own moment.
    private static readonly DateOnly Monday = new(2030, 11, 4);

    private static string Iso(DateOnly date) => date.ToString("yyyy-MM-dd");

    /// <summary>A moment on the Kyiv wall clock, which is two hours ahead of UTC in November.</summary>
    private static DateTime Kyiv(DateOnly date, int hour, int minute = 0)
        => new DateTime(date.Year, date.Month, date.Day, hour, minute, 0, DateTimeKind.Utc).AddHours(-2);

    private static async Task<JsonElement> Read(HttpResponseMessage response)
    {
        var body = await response.Content.ReadAsStringAsync();

        Assert.True(
            response.IsSuccessStatusCode,
            $"{(int)response.StatusCode} {response.RequestMessage?.RequestUri}: {body}");

        return JsonDocument.Parse(body).RootElement.Clone();
    }

    private static object[] Week(params (int Weekday, string Start, string End)[] hours)
        => hours
            .Select(entry => (object)new { weekday = entry.Weekday, start_time = entry.Start, end_time = entry.End })
            .ToArray();

    /// <summary>Monday to Thursday 11 to 22, Friday 11 to 23, the weekend 13 to 23.</summary>
    private static readonly object[] Restaurant =
        Week((5, "11:00", "23:00"), (6, "13:00", "23:00"), (7, "13:00", "23:00"));

    private static async Task<int> TemplateAsync(
        HttpClient client,
        string start = "11:00",
        string end = "22:00",
        object[]? weekHours = null,
        bool? autoClock = null)
    {
        var made = await Read(await client.PostAsJsonAsync("/shifter/v1/shifts", new
        {
            name = "Вечер",
            symbol = (string?)null,
            location_id = (int?)null,
            start_time = start,
            end_time = end,
            salary_period = "hour",
            salary_amount = 100m,
            break_minutes = 0,
            week_hours = weekHours,
            auto_clock = autoClock,
        }));

        return made.GetProperty("id").GetInt32();
    }

    /// <summary>Everything an older client knows how to send, and nothing it does not.</summary>
    private static object OldClientTemplate(string start = "11:00", string end = "22:00") => new
    {
        name = "Вечер",
        symbol = (string?)null,
        location_id = (int?)null,
        start_time = start,
        end_time = end,
        salary_period = "hour",
        salary_amount = 100m,
        break_minutes = 0,
    };

    private static object Entry(
        int shiftId,
        bool worked = false,
        bool needsCover = false,
        string? actualStart = null,
        string? actualEnd = null,
        bool autoClosed = false,
        decimal? revenue = null,
        int? breakMinutes = null) => new
        {
            shift_id = shiftId,
            worked,
            needs_cover = needsCover,
            actual_start = actualStart,
            actual_end = actualEnd,
            break_minutes = breakMinutes,
            revenue,
            auto_closed = autoClosed,
        };

    private static async Task<JsonElement> SaveAsync(
        HttpClient client, DateOnly date, object entry, int? version = null, decimal? tips = null)
        => await Read(await PutAsync(client, date, entry, version, tips));

    /// <summary>The save as it goes out, for a test that wants to see it refused.</summary>
    private static Task<HttpResponseMessage> PutAsync(
        HttpClient client, DateOnly date, object entry, int? version = null, decimal? tips = null)
        => client.PutAsJsonAsync($"/shifter/v1/days/{Iso(date)}", new
        {
            shifts = new[] { entry },
            sales = Array.Empty<object>(),
            tips,
            tips_cash = (decimal?)null,
            deductions = 0m,
            deduction_reason = (string?)null,
            note = (string?)null,
            version,
        });

    private static async Task<JsonElement> DayAsync(HttpClient client, DateOnly date)
    {
        var range = await Read(await client.GetAsync(
            $"/shifter/v1/days?from={Iso(date)}&to={Iso(date)}"));

        return range.GetProperty("days")[0];
    }

    private static async Task<JsonElement> ShiftOnAsync(HttpClient client, DateOnly date)
        => (await DayAsync(client, date)).GetProperty("shifts")[0];

    private async Task<int> PassAsync(DateTime utcNow)
    {
        var closer = ActivatorUtilities.CreateInstance<ShiftCloser>(api.Services);

        using var scope = api.Services.CreateScope();

        return await closer.PassAsync(
            scope.ServiceProvider.GetRequiredService<ShifterDbContext>(),
            utcNow,
            TestContext.Current.CancellationToken);
    }

    private async Task WithDbAsync(Func<ShifterDbContext, Task> work)
    {
        using var scope = api.Services.CreateScope();

        await work(scope.ServiceProvider.GetRequiredService<ShifterDbContext>());
    }

    private async Task<int> UserIdAsync(string login)
    {
        var id = 0;

        await WithDbAsync(async db => id = await db.Users
            .Where(user => user.Login == login)
            .Select(user => user.Id)
            .SingleAsync(TestContext.Current.CancellationToken));

        return id;
    }

    // ==== Weekday hours ====

    [Fact]
    public async Task Weekday_hours_and_the_switch_round_trip_through_the_real_database()
    {
        var (client, _) = await api.SignInAsync("roundtrip");

        var id = await TemplateAsync(client, weekHours: Restaurant, autoClock: false);

        var listed = await Read(await client.GetAsync("/shifter/v1/shifts"));
        var mine = listed.EnumerateArray().Single(shift => shift.GetProperty("id").GetInt32() == id);

        Assert.False(mine.GetProperty("auto_clock").GetBoolean());

        var week = mine.GetProperty("week_hours");

        Assert.Equal(3, week.GetArrayLength());
        Assert.Equal(5, week[0].GetProperty("weekday").GetInt32());
        Assert.Equal("11:00", week[0].GetProperty("start_time").GetString());
        Assert.Equal("23:00", week[0].GetProperty("end_time").GetString());
        Assert.Equal(7, week[2].GetProperty("weekday").GetInt32());
        Assert.Equal("13:00", week[2].GetProperty("start_time").GetString());

        // A second write over the first: the column has to replace, not grow.
        var changed = await Read(await client.PutAsJsonAsync($"/shifter/v1/shifts/{id}", new
        {
            name = "Вечер",
            symbol = (string?)null,
            location_id = (int?)null,
            start_time = "11:00",
            end_time = "22:00",
            salary_period = "hour",
            salary_amount = 100m,
            break_minutes = 0,
            week_hours = Week((1, "12:00", "20:00")),
            auto_clock = true,
        }));

        Assert.True(changed.GetProperty("auto_clock").GetBoolean());
        Assert.Equal(1, changed.GetProperty("week_hours").GetArrayLength());

        var reread = (await Read(await client.GetAsync("/shifter/v1/shifts")))
            .EnumerateArray()
            .Single(shift => shift.GetProperty("id").GetInt32() == id);

        Assert.Equal(1, reread.GetProperty("week_hours")[0].GetProperty("weekday").GetInt32());
        Assert.Equal("20:00", reread.GetProperty("week_hours")[0].GetProperty("end_time").GetString());
    }

    [Fact]
    public async Task A_template_with_nothing_said_comes_back_with_an_empty_list_and_the_clock_on()
    {
        var (client, _) = await api.SignInAsync("plain");

        var made = await Read(await client.PostAsJsonAsync("/shifter/v1/shifts", OldClientTemplate()));

        Assert.True(made.GetProperty("auto_clock").GetBoolean());
        Assert.Equal(JsonValueKind.Array, made.GetProperty("week_hours").ValueKind);
        Assert.Equal(0, made.GetProperty("week_hours").GetArrayLength());
    }

    [Fact]
    public async Task A_row_from_before_the_columns_existed_reads_like_any_other()
    {
        // The migration leaves the JSON column null on the rows it finds, and
        // the column default is what turns the clock on for them.
        var (client, _) = await api.SignInAsync("legacy");
        var id = await TemplateAsync(client);

        await WithDbAsync(db => db.Database.ExecuteSqlRawAsync(
            """UPDATE "Shifts" SET "WeekHours" = NULL, "AutoClock" = DEFAULT WHERE "Id" = {0}""",
            [id],
            TestContext.Current.CancellationToken));

        var shift = (await Read(await client.GetAsync("/shifter/v1/shifts")))[0];

        Assert.True(shift.GetProperty("auto_clock").GetBoolean());
        Assert.Equal(0, shift.GetProperty("week_hours").GetArrayLength());

        // And it can be placed and edited as it stands.
        var placed = await SaveAsync(client, Monday.AddDays(4), Entry(id));

        Assert.Equal("22:00", placed.GetProperty("shifts")[0].GetProperty("end_time").GetString());

        await Read(await client.PutAsJsonAsync(
            $"/shifter/v1/shifts/{id}",
            new
            {
                name = "Вечер",
                symbol = (string?)null,
                location_id = (int?)null,
                start_time = "11:00",
                end_time = "22:00",
                salary_period = "hour",
                salary_amount = 100m,
                break_minutes = 0,
                week_hours = Restaurant,
            }));

        Assert.Equal(
            3,
            (await Read(await client.GetAsync("/shifter/v1/shifts")))[0].GetProperty("week_hours").GetArrayLength());
    }

    [Fact]
    public async Task Painting_a_template_across_a_week_gives_each_day_its_own_hours()
    {
        var (client, _) = await api.SignInAsync("wholeweek");
        var id = await TemplateAsync(client, weekHours: Restaurant);

        var dates = Enumerable.Range(0, 7).Select(offset => Iso(Monday.AddDays(offset))).ToArray();

        var painted = await Read(await client.PostAsJsonAsync(
            "/shifter/v1/days/bulk",
            new { dates, shift_id = id, mode = "add" }));

        var hours = painted.EnumerateArray()
            .OrderBy(day => day.GetProperty("date").GetString())
            .Select(day =>
            {
                var shift = day.GetProperty("shifts")[0];

                return $"{shift.GetProperty("start_time").GetString()}-{shift.GetProperty("end_time").GetString()}";
            })
            .ToArray();

        Assert.Equal(
            new[]
            {
                "11:00-22:00", "11:00-22:00", "11:00-22:00", "11:00-22:00",
                "11:00-23:00", "13:00-23:00", "13:00-23:00",
            },
            hours);
    }

    [Fact]
    public async Task A_shift_saved_onto_a_day_takes_the_hours_of_that_weekday_and_keeps_them_across_saves()
    {
        var (client, _) = await api.SignInAsync("fridaysave");
        var id = await TemplateAsync(client, weekHours: Restaurant);
        var friday = Monday.AddDays(4);

        var first = await SaveAsync(client, friday, Entry(id));
        var again = await SaveAsync(client, friday, Entry(id), first.GetProperty("version").GetInt32());

        Assert.Equal("23:00", first.GetProperty("shifts")[0].GetProperty("end_time").GetString());
        Assert.Equal("23:00", again.GetProperty("shifts")[0].GetProperty("end_time").GetString());
    }

    [Fact]
    public async Task A_priced_draft_uses_the_hours_of_each_date()
    {
        var (client, _) = await api.SignInAsync("drafting");
        var id = await TemplateAsync(client, weekHours: Restaurant);

        // A Saturday is ten hours here against the template's eleven.
        var priced = await Read(await client.PostAsJsonAsync(
            "/shifter/v1/days/price",
            new { shift_id = id, dates = new[] { Iso(Monday.AddDays(5)) } }));

        Assert.Equal(10d, priced.GetProperty("hours").GetDouble());
    }

    [Fact]
    public async Task An_older_client_updating_a_template_leaves_its_weekdays_and_switch_intact()
    {
        var (client, _) = await api.SignInAsync("oldclient");
        var id = await TemplateAsync(client, weekHours: Restaurant, autoClock: false);

        var kept = await Read(await client.PutAsJsonAsync(
            $"/shifter/v1/shifts/{id}", OldClientTemplate(start: "10:00")));

        Assert.Equal("10:00", kept.GetProperty("start_time").GetString());
        Assert.Equal(3, kept.GetProperty("week_hours").GetArrayLength());
        Assert.False(kept.GetProperty("auto_clock").GetBoolean());
    }

    [Fact]
    public async Task An_empty_list_clears_the_weekdays()
    {
        var (client, _) = await api.SignInAsync("clearing");
        var id = await TemplateAsync(client, weekHours: Restaurant);

        var cleared = await Read(await client.PutAsJsonAsync($"/shifter/v1/shifts/{id}", new
        {
            name = "Вечер",
            symbol = (string?)null,
            location_id = (int?)null,
            start_time = "11:00",
            end_time = "22:00",
            salary_period = "hour",
            salary_amount = 100m,
            break_minutes = 0,
            week_hours = Array.Empty<object>(),
        }));

        Assert.Equal(0, cleared.GetProperty("week_hours").GetArrayLength());
    }

    [Fact]
    public async Task A_bad_weekday_is_refused_at_the_door()
    {
        var (client, _) = await api.SignInAsync("badweekday");

        var refused = await client.PostAsJsonAsync("/shifter/v1/shifts", new
        {
            name = "Вечер",
            symbol = (string?)null,
            location_id = (int?)null,
            start_time = "11:00",
            end_time = "22:00",
            salary_period = "hour",
            salary_amount = 100m,
            break_minutes = 0,
            week_hours = Week((8, "11:00", "22:00")),
        });

        Assert.False(refused.IsSuccessStatusCode);
    }

    [Fact]
    public async Task The_takeout_carries_the_weekday_hours()
    {
        var (client, _) = await api.SignInAsync("takeoutweek");

        await TemplateAsync(client, weekHours: Restaurant);

        var response = await client.GetAsync("/shifter/v1/account/export");

        response.EnsureSuccessStatusCode();

        using var zip = new ZipArchive(
            new MemoryStream(await response.Content.ReadAsByteArrayAsync()),
            ZipArchiveMode.Read);

        using var reader = new StreamReader(zip.GetEntry("shifts.json")!.Open());

        var shift = JsonDocument.Parse(await reader.ReadToEndAsync()).RootElement[0];

        Assert.Equal(5, shift.GetProperty("week_hours")[0].GetProperty("weekday").GetInt32());
        Assert.Equal("23:00", shift.GetProperty("week_hours")[0].GetProperty("end").GetString());
    }

    [Fact]
    public async Task A_template_edit_moves_the_days_still_waiting_and_only_those()
    {
        var (client, _) = await api.SignInAsync("retime");
        var today = new AppClock().Today;
        var id = await TemplateAsync(client);

        var followed = today.AddDays(10);
        var timed = today.AddDays(11);
        var worked = today.AddDays(12);
        var behind = today.AddDays(-7);

        var version = (await SaveAsync(client, followed, Entry(id))).GetProperty("version").GetInt32();

        await SaveAsync(client, timed, Entry(id));
        await SaveAsync(client, worked, Entry(id, worked: true));
        await SaveAsync(client, behind, Entry(id));

        // What the planner writes when somebody accepts a rota entry.
        await WithDbAsync(db => db.DayShifts
            .Where(entry => entry.ShiftId == id && entry.Day!.Date == timed)
            .ExecuteUpdateAsync(
                setters => setters
                    .SetProperty(entry => entry.StartTime, new TimeOnly(15, 0))
                    .SetProperty(entry => entry.EndTime, new TimeOnly(21, 30)),
                TestContext.Current.CancellationToken));

        await Read(await client.PutAsJsonAsync(
            $"/shifter/v1/shifts/{id}", OldClientTemplate(end: "23:00")));

        var moved = await DayAsync(client, followed);

        Assert.Equal("23:00", moved.GetProperty("shifts")[0].GetProperty("end_time").GetString());
        Assert.Equal(version + 1, moved.GetProperty("version").GetInt32());

        // A panel still holding the old version is told so.
        var conflict = await client.PutAsJsonAsync($"/shifter/v1/days/{Iso(followed)}", new
        {
            shifts = new[] { Entry(id) },
            sales = Array.Empty<object>(),
            tips = (decimal?)null,
            tips_cash = (decimal?)null,
            deductions = 0m,
            deduction_reason = (string?)null,
            note = (string?)null,
            version,
        });

        Assert.Equal(System.Net.HttpStatusCode.Conflict, conflict.StatusCode);

        var left = await ShiftOnAsync(client, timed);

        Assert.Equal("15:00", left.GetProperty("start_time").GetString());
        Assert.Equal("21:30", left.GetProperty("end_time").GetString());

        Assert.Equal("22:00", (await ShiftOnAsync(client, worked)).GetProperty("end_time").GetString());
        Assert.Equal("22:00", (await ShiftOnAsync(client, behind)).GetProperty("end_time").GetString());
    }

    // ==== The close ====

    [Fact]
    public async Task A_shift_that_is_over_closes_itself_without_touching_the_version()
    {
        // A date of its own: this is the one test that counts what a pass did,
        // and a pass sweeps every account.
        var date = Monday.AddDays(21);

        var (client, login) = await api.SignInAsync("closing");
        var id = await TemplateAsync(client);

        var version = (await SaveAsync(client, date, Entry(id))).GetProperty("version").GetInt32();

        Assert.Equal(0, await PassAsync(Kyiv(date, 21, 59)));
        Assert.False((await ShiftOnAsync(client, date)).GetProperty("worked").GetBoolean());

        Assert.Equal(1, await PassAsync(Kyiv(date, 22, 0)));

        var day = await DayAsync(client, date);
        var shift = day.GetProperty("shifts")[0];

        Assert.True(shift.GetProperty("worked").GetBoolean());
        Assert.True(shift.GetProperty("auto_closed").GetBoolean());
        Assert.Equal("11:00", shift.GetProperty("actual_start").GetString());
        Assert.Equal("22:00", shift.GetProperty("actual_end").GetString());
        Assert.Equal(version, day.GetProperty("version").GetInt32());

        // Eleven hours at a hundred, now counted as earned.
        Assert.Equal(1_100m, day.GetProperty("earned").GetDecimal());

        var userId = await UserIdAsync(login);

        await WithDbAsync(async db =>
        {
            var line = await db.DayAudits.SingleAsync(
                audit => audit.UserId == userId && audit.Source == "auto",
                TestContext.Current.CancellationToken);

            Assert.Equal(date, line.Date);
            Assert.Equal(1, line.WorkedCount);
            Assert.Equal(11d, line.Hours);
            Assert.Equal(1_100m, line.Earned);
        });

        // A second tick has nothing left to do.
        Assert.Equal(0, await PassAsync(Kyiv(date, 22, 1)));
    }

    [Fact]
    public async Task The_close_runs_on_the_hours_of_that_weekday()
    {
        var (client, _) = await api.SignInAsync("closefriday");
        var id = await TemplateAsync(client, weekHours: Restaurant);
        var friday = Monday.AddDays(4);

        await SaveAsync(client, friday, Entry(id));

        await PassAsync(Kyiv(friday, 22, 30));
        Assert.False((await ShiftOnAsync(client, friday)).GetProperty("worked").GetBoolean());

        await PassAsync(Kyiv(friday, 23, 0));
        Assert.True((await ShiftOnAsync(client, friday)).GetProperty("worked").GetBoolean());
    }

    [Fact]
    public async Task An_overnight_shift_belongs_to_the_day_it_started_and_closes_the_next_morning()
    {
        var (client, _) = await api.SignInAsync("overnight");
        var id = await TemplateAsync(client, start: "22:00", end: "02:00");

        await SaveAsync(client, Monday, Entry(id));

        await PassAsync(Kyiv(Monday.AddDays(1), 1, 59));
        Assert.False((await ShiftOnAsync(client, Monday)).GetProperty("worked").GetBoolean());

        await PassAsync(Kyiv(Monday.AddDays(1), 2, 0));
        Assert.True((await ShiftOnAsync(client, Monday)).GetProperty("worked").GetBoolean());
    }

    [Fact]
    public async Task A_later_actual_end_holds_the_close_back_and_a_lone_start_is_kept()
    {
        var (client, _) = await api.SignInAsync("lateedge");
        var id = await TemplateAsync(client);

        await SaveAsync(client, Monday, Entry(id, actualEnd: "23:10"));

        await PassAsync(Kyiv(Monday, 22, 30));
        Assert.False((await ShiftOnAsync(client, Monday)).GetProperty("worked").GetBoolean());

        await PassAsync(Kyiv(Monday, 23, 10));

        var shift = await ShiftOnAsync(client, Monday);

        Assert.True(shift.GetProperty("worked").GetBoolean());
        Assert.Equal("11:00", shift.GetProperty("actual_start").GetString());
        Assert.Equal("23:10", shift.GetProperty("actual_end").GetString());

        var tuesday = Monday.AddDays(1);

        await SaveAsync(client, tuesday, Entry(id, actualStart: "10:40"));

        var planned = await ShiftOnAsync(client, tuesday);

        Assert.Equal("10:40", planned.GetProperty("actual_start").GetString());
        Assert.Equal(JsonValueKind.Null, planned.GetProperty("actual_end").ValueKind);

        await PassAsync(Kyiv(tuesday, 22, 0));

        var closed = await ShiftOnAsync(client, tuesday);

        Assert.Equal("10:40", closed.GetProperty("actual_start").GetString());
        Assert.Equal("22:00", closed.GetProperty("actual_end").GetString());
    }

    [Fact]
    public async Task A_shift_still_ahead_is_left_alone()
    {
        var (client, _) = await api.SignInAsync("ahead");
        var id = await TemplateAsync(client);
        var tomorrow = Monday.AddDays(1);

        await SaveAsync(client, tomorrow, Entry(id));

        await PassAsync(Kyiv(Monday, 23, 0));

        var shift = await ShiftOnAsync(client, tomorrow);

        Assert.False(shift.GetProperty("worked").GetBoolean());
        Assert.False(shift.GetProperty("auto_closed").GetBoolean());
    }

    [Fact]
    public async Task A_shift_up_for_cover_is_left_alone()
    {
        var (client, _) = await api.SignInAsync("cover");
        var id = await TemplateAsync(client);

        await SaveAsync(client, Monday, Entry(id, needsCover: true));

        await PassAsync(Kyiv(Monday, 23, 0));

        var shift = await ShiftOnAsync(client, Monday);

        Assert.False(shift.GetProperty("worked").GetBoolean());
        Assert.True(shift.GetProperty("needs_cover").GetBoolean());
    }

    [Fact]
    public async Task A_shift_already_stamped_is_left_alone()
    {
        var (client, _) = await api.SignInAsync("stamped");
        var id = await TemplateAsync(client);

        await SaveAsync(client, Monday, Entry(id, autoClosed: true));

        await PassAsync(Kyiv(Monday, 23, 0));

        var shift = await ShiftOnAsync(client, Monday);

        Assert.False(shift.GetProperty("worked").GetBoolean());
        Assert.True(shift.GetProperty("auto_closed").GetBoolean());
    }

    [Fact]
    public async Task A_shift_of_an_archived_template_is_left_alone()
    {
        var (client, _) = await api.SignInAsync("archived");
        var id = await TemplateAsync(client);

        await SaveAsync(client, Monday, Entry(id));

        await WithDbAsync(async db =>
        {
            var template = await db.Shifts.SingleAsync(
                shift => shift.Id == id, TestContext.Current.CancellationToken);

            template.ToArchive();

            await db.SaveChangesAsync(TestContext.Current.CancellationToken);
        });

        await PassAsync(Kyiv(Monday, 23, 0));

        Assert.False((await ShiftOnAsync(client, Monday)).GetProperty("worked").GetBoolean());
    }

    [Fact]
    public async Task A_template_with_the_clock_off_is_left_alone()
    {
        var (client, _) = await api.SignInAsync("clockoff");
        var id = await TemplateAsync(client, autoClock: false);

        await SaveAsync(client, Monday, Entry(id));

        await PassAsync(Kyiv(Monday, 23, 0));

        Assert.False((await ShiftOnAsync(client, Monday)).GetProperty("worked").GetBoolean());
    }

    [Fact]
    public async Task History_past_the_lookback_is_never_touched()
    {
        var (client, _) = await api.SignInAsync("history");
        var id = await TemplateAsync(client);

        var inside = Monday.AddDays(-3);
        var outside = Monday.AddDays(-4);

        await SaveAsync(client, inside, Entry(id));
        await SaveAsync(client, outside, Entry(id));

        await PassAsync(Kyiv(Monday, 12, 0));

        Assert.True((await ShiftOnAsync(client, inside)).GetProperty("worked").GetBoolean());
        Assert.False((await ShiftOnAsync(client, outside)).GetProperty("worked").GetBoolean());
    }

    [Fact]
    public async Task Each_shift_on_a_day_closes_on_its_own_clock_with_one_line_per_pass()
    {
        var (client, login) = await api.SignInAsync("twoshifts");
        var morning = await TemplateAsync(client, start: "08:00", end: "12:00");
        var evening = await TemplateAsync(client, start: "18:00", end: "22:00");

        await Read(await client.PutAsJsonAsync($"/shifter/v1/days/{Iso(Monday)}", new
        {
            shifts = new[] { Entry(morning), Entry(evening) },
            sales = Array.Empty<object>(),
            tips = (decimal?)null,
            tips_cash = (decimal?)null,
            deductions = 0m,
            deduction_reason = (string?)null,
            note = (string?)null,
        }));

        await PassAsync(Kyiv(Monday, 13, 0));

        var day = await DayAsync(client, Monday);
        var worked = day.GetProperty("shifts").EnumerateArray().Count(shift => shift.GetProperty("worked").GetBoolean());

        Assert.Equal(1, worked);

        var userId = await UserIdAsync(login);

        await WithDbAsync(async db =>
            Assert.Equal(1, await db.DayAudits.CountAsync(
                audit => audit.UserId == userId && audit.Source == "auto",
                TestContext.Current.CancellationToken)));
    }

    [Fact]
    public async Task A_close_is_read_in_the_zone_of_the_newest_phone()
    {
        var (client, login) = await api.SignInAsync("zones");
        var id = await TemplateAsync(client);
        var userId = await UserIdAsync(login);

        await SaveAsync(client, Monday, Entry(id));

        await WithDbAsync(async db =>
        {
            db.DeviceTokens.Add(new DeviceToken
            {
                UserId = userId,
                Token = $"old-{login}",
                Platform = "ios",
                TimeZone = "Asia/Tokyo",
                LastSeenAt = DateTime.UtcNow.AddDays(-30),
            });

            db.DeviceTokens.Add(new DeviceToken
            {
                UserId = userId,
                Token = $"new-{login}",
                Platform = "ios",
                TimeZone = "America/New_York",
                LastSeenAt = DateTime.UtcNow,
            });

            // Never reached: a phone outranks a browser.
            db.PushSubscriptions.Add(new PushSubscription
            {
                UserId = userId,
                Endpoint = $"https://push.example/{login}",
                P256dh = "key",
                Auth = "auth",
                TimeZone = "Asia/Tokyo",
                Language = "ru",
                NotifyAt = "19:00",
                CreatedAt = DateTime.UtcNow,
            });

            await db.SaveChangesAsync(TestContext.Current.CancellationToken);
        });

        // 22:00 in Kyiv has been and gone; in New York it is four in the afternoon.
        await PassAsync(Kyiv(Monday, 23, 0));
        Assert.False((await ShiftOnAsync(client, Monday)).GetProperty("worked").GetBoolean());

        // New York is five hours behind UTC by then, so 22:00 there is 03:00 UTC.
        await PassAsync(new DateTime(2030, 11, 5, 3, 0, 0, DateTimeKind.Utc));
        Assert.True((await ShiftOnAsync(client, Monday)).GetProperty("worked").GetBoolean());
    }

    [Fact]
    public async Task With_no_phone_a_browser_then_a_chat_says_where_somebody_is()
    {
        var (browser, browserLogin) = await api.SignInAsync("zonebrowser");
        var (chat, chatLogin) = await api.SignInAsync("zonechat");
        var inBrowser = await TemplateAsync(browser);
        var inChat = await TemplateAsync(chat);
        var browserUser = await UserIdAsync(browserLogin);
        var chatUser = await UserIdAsync(chatLogin);

        await SaveAsync(browser, Monday, Entry(inBrowser));
        await SaveAsync(chat, Monday, Entry(inChat));

        await WithDbAsync(async db =>
        {
            db.PushSubscriptions.Add(new PushSubscription
            {
                UserId = browserUser,
                Endpoint = $"https://push.example/{browserLogin}",
                P256dh = "key",
                Auth = "auth",
                TimeZone = "America/New_York",
                Language = "ru",
                NotifyAt = "19:00",
                CreatedAt = DateTime.UtcNow,
            });

            db.TelegramLinks.Add(new TelegramLink
            {
                UserId = chatUser,
                ChatId = Random.Shared.NextInt64(1, long.MaxValue),
                TimeZone = "America/New_York",
            });

            await db.SaveChangesAsync(TestContext.Current.CancellationToken);
        });

        await PassAsync(Kyiv(Monday, 23, 0));

        Assert.False((await ShiftOnAsync(browser, Monday)).GetProperty("worked").GetBoolean());
        Assert.False((await ShiftOnAsync(chat, Monday)).GetProperty("worked").GetBoolean());

        await PassAsync(new DateTime(2030, 11, 5, 3, 0, 0, DateTimeKind.Utc));

        Assert.True((await ShiftOnAsync(browser, Monday)).GetProperty("worked").GetBoolean());
        Assert.True((await ShiftOnAsync(chat, Monday)).GetProperty("worked").GetBoolean());
    }

    [Fact]
    public async Task A_zone_nobody_has_heard_of_falls_back_to_the_app_clock()
    {
        var (client, login) = await api.SignInAsync("nozone");
        var id = await TemplateAsync(client);
        var userId = await UserIdAsync(login);

        await SaveAsync(client, Monday, Entry(id));

        await WithDbAsync(async db =>
        {
            db.DeviceTokens.Add(new DeviceToken
            {
                UserId = userId,
                Token = $"mars-{login}",
                Platform = "ios",
                TimeZone = "Mars/Olympus",
            });

            await db.SaveChangesAsync(TestContext.Current.CancellationToken);
        });

        await PassAsync(Kyiv(Monday, 22, 0));

        Assert.True((await ShiftOnAsync(client, Monday)).GetProperty("worked").GetBoolean());
    }

    [Fact]
    public async Task A_close_on_a_minute_the_clocks_skip_passes_without_throwing()
    {
        // 03:00 became 04:00 in Kyiv on this Sunday.
        var (client, _) = await api.SignInAsync("gap");
        var id = await TemplateAsync(client, start: "20:00", end: "03:30");
        var saturday = new DateOnly(2031, 3, 29);

        await SaveAsync(client, saturday, Entry(id));

        // The 03:30 it ends at never happened, so it closes at 04:30 on the far
        // side of the jump, and not a minute before.
        await PassAsync(new DateTime(2031, 3, 30, 1, 29, 0, DateTimeKind.Utc));
        Assert.False((await ShiftOnAsync(client, saturday)).GetProperty("worked").GetBoolean());

        await PassAsync(new DateTime(2031, 3, 30, 1, 30, 0, DateTimeKind.Utc));
        Assert.True((await ShiftOnAsync(client, saturday)).GetProperty("worked").GetBoolean());
    }

    [Fact]
    public async Task A_close_can_cross_a_goal()
    {
        var (client, login) = await api.SignInAsync("goalcross");
        var id = await TemplateAsync(client);
        var userId = await UserIdAsync(login);

        await SaveAsync(client, Monday, Entry(id));

        await WithDbAsync(async db =>
        {
            db.Goals.Add(new Goal { UserId = userId, Period = GoalPeriod.Day, Amount = 500m });

            await db.SaveChangesAsync(TestContext.Current.CancellationToken);
        });

        await PassAsync(Kyiv(Monday, 22, 0));
        await api.GoalChecksAsync();

        await WithDbAsync(async db =>
            Assert.Equal(1, await db.GoalCheers.CountAsync(
                cheer => cheer.UserId == userId,
                TestContext.Current.CancellationToken)));
    }

    [Fact]
    public async Task A_close_takes_the_place_s_break_so_a_tip_next_morning_moves_no_pay()
    {
        var (client, _) = await api.SignInAsync("closebreak");

        var id = await TemplateUnderBreakRuleAsync(client, "22:00");

        await SaveAsync(client, Monday, Entry(id));

        // A row from before painting took the rule, the one kind that can
        // still reach the close without its minutes.
        await WithDbAsync(db => db.DayShifts
            .Where(entry => entry.ShiftId == id)
            .ExecuteUpdateAsync(
                setters => setters.SetProperty(entry => entry.BreakMinutes, 0),
                TestContext.Current.CancellationToken));

        await PassAsync(Kyiv(Monday, 22, 0));

        var closed = await DayAsync(client, Monday);

        Assert.Equal(30, closed.GetProperty("shifts")[0].GetProperty("break_minutes").GetInt32());
        Assert.Equal(2100m, closed.GetProperty("earned").GetDecimal());

        var tipped = await SaveAsync(
            client,
            Monday,
            Entry(id, worked: true, actualStart: "11:00", actualEnd: "22:00", autoClosed: true),
            closed.GetProperty("version").GetInt32());

        Assert.Equal(2100m, tipped.GetProperty("earned").GetDecimal());
    }

    [Fact]
    public async Task A_close_leaves_a_shift_too_short_for_the_rule_on_its_own_break()
    {
        var (client, _) = await api.SignInAsync("closeshort");

        var id = await TemplateUnderBreakRuleAsync(client, "15:00");

        await SaveAsync(client, Monday, Entry(id));
        await PassAsync(Kyiv(Monday, 15, 0));

        Assert.Equal(0, (await ShiftOnAsync(client, Monday)).GetProperty("break_minutes").GetInt32());
    }

    [Fact]
    public async Task Hours_delivered_after_the_close_reach_the_pay()
    {
        var (client, login) = await api.SignInAsync("latehours");
        var id = await TemplateAsync(client);

        await SaveAsync(client, Monday, Entry(id));
        await PassAsync(Kyiv(Monday, 22, 0));

        await MergeAsync(await UserIdAsync(login), new DayShift
        {
            ShiftId = id,
            SalaryPeriod = SalaryPeriod.Hour,
            SalaryAmount = 100m,
            StartTime = new TimeOnly(10, 45),
            EndTime = new TimeOnly(23, 15),
            Worked = true,
        });

        var day = await DayAsync(client, Monday);
        var shift = day.GetProperty("shifts")[0];

        Assert.Equal("10:45", shift.GetProperty("actual_start").GetString());
        Assert.Equal("23:15", shift.GetProperty("actual_end").GetString());
        Assert.Equal(1250m, day.GetProperty("earned").GetDecimal());
    }

    [Fact]
    public async Task A_delivery_moves_only_the_edges_the_close_copied_from_the_plan()
    {
        var (client, login) = await api.SignInAsync("realedge");
        var id = await TemplateAsync(client);

        // The real start was there before the close; the end is the plan's copy.
        await SaveAsync(client, Monday, Entry(id, actualStart: "10:40"));
        await PassAsync(Kyiv(Monday, 22, 0));

        await MergeAsync(await UserIdAsync(login), new DayShift
        {
            ShiftId = id,
            SalaryPeriod = SalaryPeriod.Hour,
            SalaryAmount = 100m,
            StartTime = new TimeOnly(11, 0),
            EndTime = new TimeOnly(23, 0),
            Worked = true,
        });

        var shift = await ShiftOnAsync(client, Monday);

        Assert.Equal("10:40", shift.GetProperty("actual_start").GetString());
        Assert.Equal("23:00", shift.GetProperty("actual_end").GetString());
    }

    [Fact]
    public async Task A_late_merge_saying_not_worked_cannot_take_back_a_close()
    {
        var (client, login) = await api.SignInAsync("latemerge");
        var id = await TemplateAsync(client);

        await SaveAsync(client, Monday, Entry(id));
        await PassAsync(Kyiv(Monday, 22, 0));

        // A rota assignment for the same shift, accepted half an hour after it ended.
        await MergeAsync(await UserIdAsync(login), new DayShift
        {
            ShiftId = id,
            SalaryPeriod = SalaryPeriod.Hour,
            SalaryAmount = 100m,
            StartTime = new TimeOnly(11, 0),
            EndTime = new TimeOnly(22, 0),
            Worked = false,
        });

        var day = await DayAsync(client, Monday);

        Assert.True(day.GetProperty("shifts")[0].GetProperty("worked").GetBoolean());
        Assert.Equal(1100m, day.GetProperty("earned").GetDecimal());
    }

    [Fact]
    public async Task A_merge_still_lowers_a_shift_the_close_never_touched()
    {
        var (client, login) = await api.SignInAsync("plainmerge");
        var id = await TemplateAsync(client);

        await SaveAsync(client, Monday, Entry(id, worked: true));

        await MergeAsync(await UserIdAsync(login), new DayShift
        {
            ShiftId = id,
            SalaryPeriod = SalaryPeriod.Hour,
            SalaryAmount = 100m,
            StartTime = new TimeOnly(11, 0),
            EndTime = new TimeOnly(22, 0),
            Worked = false,
        });

        Assert.False((await ShiftOnAsync(client, Monday)).GetProperty("worked").GetBoolean());
    }

    [Fact]
    public async Task A_telegram_finish_lands_its_real_times_over_the_close_on_one_placement()
    {
        var (client, login) = await api.SignInAsync("tgclose");
        var id = await TemplateAsync(client, "13:00", "23:00");
        var sunday = Monday.AddDays(6);

        await SaveAsync(client, sunday, Entry(id));
        await PassAsync(Kyiv(sunday, 23, 0));

        // What ClockOutAsync hands over for «начал» on Sunday and «закончил» at 00:20.
        await MergeAsync(await UserIdAsync(login), new DayShift
        {
            ShiftId = id,
            SalaryPeriod = SalaryPeriod.Hour,
            SalaryAmount = 100m,
            StartTime = new TimeOnly(13, 0),
            EndTime = new TimeOnly(23, 0),
            ActualStart = new TimeOnly(13, 2),
            ActualEnd = new TimeOnly(0, 20),
            Worked = true,
        }, sunday);

        var day = await DayAsync(client, sunday);

        Assert.Equal(1, day.GetProperty("shifts").GetArrayLength());

        var shift = day.GetProperty("shifts")[0];

        Assert.Equal("13:02", shift.GetProperty("actual_start").GetString());
        Assert.Equal("00:20", shift.GetProperty("actual_end").GetString());
        Assert.True(shift.GetProperty("worked").GetBoolean());
    }

    [Fact]
    public async Task A_finish_through_the_bot_is_filed_on_the_day_the_shift_started()
    {
        var (client, login) = await api.SignInAsync("tgbot");
        var id = await TemplateAsync(client, "13:00", "23:00");
        var sunday = Monday.AddDays(6);
        var user = await UserIdAsync(login);
        var chat = 7_100_000_000L + user;

        await SaveAsync(client, sunday, Entry(id));
        await PassAsync(Kyiv(sunday, 23, 0));

        await WithDbAsync(async db =>
        {
            db.TelegramLinks.Add(new TelegramLink
            {
                UserId = user,
                ChatId = chat,
                TimeZone = "Europe/Kyiv",
                ClockInAtUtc = Kyiv(sunday, 13, 2),
            });

            await db.SaveChangesAsync(TestContext.Current.CancellationToken);
        });

        // «Закончил» always arrives on the real clock, which here is years
        // from that Sunday rather than one midnight: the same gap, easier to tell apart.
        var reply = await api.Services.GetRequiredService<TelegramBotService>()
            .HandleAsync(chat, "закончил", TestContext.Current.CancellationToken);

        Assert.StartsWith("Записал", reply);

        var day = await DayAsync(client, sunday);

        Assert.Equal(1, day.GetProperty("shifts").GetArrayLength());
        Assert.Equal("13:02", day.GetProperty("shifts")[0].GetProperty("actual_start").GetString());

        var today = DateOnly.FromDateTime(DateTime.UtcNow);
        var around = await Read(await client.GetAsync(
            $"/shifter/v1/days?from={Iso(today.AddDays(-1))}&to={Iso(today.AddDays(1))}"));

        Assert.Equal(0, around.GetProperty("days").GetArrayLength());
    }

    [Fact]
    public async Task A_delivery_over_a_close_keeps_the_place_s_break_so_a_tip_moves_no_pay()
    {
        var (client, login) = await api.SignInAsync("mergebreak");
        var id = await TemplateUnderBreakRuleAsync(client, "22:00");

        await SaveAsync(client, Monday, Entry(id));
        await PassAsync(Kyiv(Monday, 22, 0));

        // The bot, the till and the rota all hand over the template's own
        // break, which here is none.
        await MergeAsync(await UserIdAsync(login), Delivered(id, 10, 30, 22, 30));

        var merged = await DayAsync(client, Monday);

        Assert.Equal(30, merged.GetProperty("shifts")[0].GetProperty("break_minutes").GetInt32());
        Assert.Equal(2300m, merged.GetProperty("earned").GetDecimal());

        var tipped = await SaveAsync(
            client,
            Monday,
            Entry(id, worked: true, actualStart: "10:30", actualEnd: "22:30", autoClosed: true),
            merged.GetProperty("version").GetInt32());

        Assert.Equal(2300m, tipped.GetProperty("earned").GetDecimal());
    }

    [Fact]
    public async Task A_delivery_short_of_the_rule_gives_the_close_s_break_back()
    {
        var (client, login) = await api.SignInAsync("mergeshort");
        var id = await TemplateUnderBreakRuleAsync(client, "22:00");

        await SaveAsync(client, Monday, Entry(id));
        await PassAsync(Kyiv(Monday, 22, 0));

        // Four hours in the end, so the rule that took the 30 minutes no longer applies.
        await MergeAsync(await UserIdAsync(login), Delivered(id, 11, 0, 15, 0));

        Assert.Equal(0, (await ShiftOnAsync(client, Monday)).GetProperty("break_minutes").GetInt32());
    }

    [Fact]
    public async Task A_delivery_onto_an_empty_day_takes_the_place_s_break_as_well()
    {
        var (client, login) = await api.SignInAsync("mergefresh");
        var id = await TemplateUnderBreakRuleAsync(client, "22:00");

        await MergeAsync(await UserIdAsync(login), Delivered(id, 11, 0, 22, 0));

        var day = await DayAsync(client, Monday);

        Assert.Equal(30, day.GetProperty("shifts")[0].GetProperty("break_minutes").GetInt32());
        Assert.Equal(2100m, day.GetProperty("earned").GetDecimal());
    }

    [Fact]
    public async Task A_delivery_keeps_the_break_a_paused_clock_left_on_the_shift()
    {
        var (client, _) = await api.SignInAsync("pausedclock");
        var id = await TemplateAsync(client);

        var closed = await SaveAsync(
            client,
            Monday,
            Entry(id, worked: true, actualStart: "11:00", actualEnd: "22:00", breakMinutes: 45));

        Assert.Equal(1025m, closed.GetProperty("earned").GetDecimal());

        await DeliverAsync(
            await TillAsync(client, id),
            new { date = Iso(Monday), start = "11:00", end = "22:00" });

        var day = await DayAsync(client, Monday);

        Assert.Equal(45, day.GetProperty("shifts")[0].GetProperty("break_minutes").GetInt32());
        Assert.Equal(1025m, day.GetProperty("earned").GetDecimal());
    }

    [Fact]
    public async Task A_delivery_naming_its_own_break_is_taken_at_its_word()
    {
        var (client, _) = await api.SignInAsync("namedbreak");
        var id = await TemplateAsync(client);

        await SaveAsync(client, Monday, Entry(id, worked: true, breakMinutes: 45));

        await DeliverAsync(
            await TillAsync(client, id),
            new { date = Iso(Monday), start = "11:00", end = "22:00", break_minutes = 15 });

        Assert.Equal(15, (await ShiftOnAsync(client, Monday)).GetProperty("break_minutes").GetInt32());
    }

    [Fact]
    public async Task A_delivery_counting_paid_hours_pays_the_hours_it_counted()
    {
        var (client, _) = await api.SignInAsync("paidhours");
        var id = await TemplateAsync(client);

        await SaveAsync(client, Monday, Entry(id, worked: true, breakMinutes: 45));

        // Eight paid hours, worked out on the template's break of none. The
        // 45 minutes held here would turn them into seven and a quarter.
        await DeliverAsync(await TillAsync(client, id), new { date = Iso(Monday), hours = 8 });

        var day = await DayAsync(client, Monday);

        Assert.Equal(0, day.GetProperty("shifts")[0].GetProperty("break_minutes").GetInt32());
        Assert.Equal(800m, day.GetProperty("earned").GetDecimal());
    }

    [Fact]
    public async Task A_count_over_real_edges_leaves_their_break_and_their_pay()
    {
        var (client, _) = await api.SignInAsync("countedges");
        var id = await TemplateAt200Async(client);

        await SaveAsync(client, Monday, Entry(id, worked: true, actualStart: "11:00", actualEnd: "22:00", breakMinutes: 45));

        await DeliverAsync(await TillAsync(client, id), new { date = Iso(Monday), hours = 8 });

        // The end of a count never became this shift's: the edges say when it
        // ended, so taking the break away would only have raised the pay.
        var day = await DayAsync(client, Monday);

        Assert.Equal(45, day.GetProperty("shifts")[0].GetProperty("break_minutes").GetInt32());
        Assert.Equal("22:00", day.GetProperty("shifts")[0].GetProperty("actual_end").GetString());
        Assert.Equal(2050m, day.GetProperty("earned").GetDecimal());
    }

    [Fact]
    public async Task A_count_over_a_close_runs_from_the_real_start_and_pays_what_it_counted()
    {
        var (client, _) = await api.SignInAsync("countstart");
        var id = await TemplateAt200Async(client);

        await SaveAsync(client, Monday, Entry(id, actualStart: "10:40", breakMinutes: 45));
        await PassAsync(Kyiv(Monday, 22, 0));

        await DeliverAsync(await TillAsync(client, id), new { date = Iso(Monday), hours = 8 });

        var day = await DayAsync(client, Monday);
        var shift = day.GetProperty("shifts")[0];

        Assert.Equal("10:40", shift.GetProperty("actual_start").GetString());
        Assert.Equal("18:40", shift.GetProperty("actual_end").GetString());
        Assert.Equal(1600m, Math.Round(day.GetProperty("earned").GetDecimal(), 2));
    }

    [Fact]
    public async Task A_count_at_a_place_with_a_break_rule_lengthens_the_shift_to_pay_it()
    {
        var (client, _) = await api.SignInAsync("countrule");
        var id = await TemplateUnderBreakRuleAsync(client, "16:00");

        await DeliverAsync(await TillAsync(client, id), new { date = Iso(Monday), hours = 8 });

        var day = await DayAsync(client, Monday);
        var shift = day.GetProperty("shifts")[0];

        Assert.Equal("19:30", shift.GetProperty("end_time").GetString());
        Assert.Equal(30, shift.GetProperty("break_minutes").GetInt32());
        Assert.Equal(1600m, day.GetProperty("earned").GetDecimal());

        // The same over a row already there, and it survives the next save.
        var second = Monday.AddDays(1);

        await SaveAsync(client, second, Entry(id));
        await DeliverAsync(await TillAsync(client, id), new { date = Iso(second), hours = 8 });

        var over = await DayAsync(client, second);

        Assert.Equal(1600m, over.GetProperty("earned").GetDecimal());

        var saved = await SaveAsync(
            client, second, Entry(id, worked: true, breakMinutes: 30), over.GetProperty("version").GetInt32());

        Assert.Equal(1600m, saved.GetProperty("earned").GetDecimal());
    }

    [Fact]
    public async Task A_delivery_short_of_the_rule_leaves_a_break_somebody_took_themselves()
    {
        var (client, login) = await api.SignInAsync("ownbreak");
        var id = await TemplateUnderBreakRuleAsync(client, "16:00");

        // The same 30 minutes the rule would take, but five hours is under
        // it: nothing but a person can have put them there.
        await SaveAsync(client, Monday, Entry(id, worked: true, breakMinutes: 30));

        await MergeAsync(await UserIdAsync(login), Delivered(id, 11, 0, 16, 0));

        Assert.Equal(30, (await ShiftOnAsync(client, Monday)).GetProperty("break_minutes").GetInt32());
    }

    [Fact]
    public async Task A_bot_finish_keeps_the_break_and_stops_a_screen_holding_the_plan()
    {
        var (client, login) = await api.SignInAsync("botbreak");
        var id = await TemplateAsync(client);
        var user = await UserIdAsync(login);
        var chat = 7_200_000_000L + user;

        var version = (await SaveAsync(client, Monday, Entry(id, breakMinutes: 45)))
            .GetProperty("version").GetInt32();

        await WithDbAsync(async db =>
        {
            db.TelegramLinks.Add(new TelegramLink
            {
                UserId = user,
                ChatId = chat,
                TimeZone = "Europe/Kyiv",
                ClockInAtUtc = Kyiv(Monday, 11, 2),
            });

            await db.SaveChangesAsync(TestContext.Current.CancellationToken);
        });

        var reply = await api.Services.GetRequiredService<TelegramBotService>()
            .HandleAsync(chat, "закончил", TestContext.Current.CancellationToken);

        Assert.StartsWith("Записал", reply);

        var day = await DayAsync(client, Monday);

        Assert.Equal(45, day.GetProperty("shifts")[0].GetProperty("break_minutes").GetInt32());
        Assert.Equal(version + 1, day.GetProperty("version").GetInt32());
    }

    // ==== The version, when a day changes from outside ====

    [Fact]
    public async Task A_delivery_stops_a_screen_still_holding_the_close()
    {
        var (client, _) = await api.SignInAsync("heldclose");
        var id = await TemplateAsync(client);

        var version = (await SaveAsync(client, Monday, Entry(id))).GetProperty("version").GetInt32();

        await PassAsync(Kyiv(Monday, 22, 0));

        await DeliverAsync(
            await TillAsync(client, id),
            new { date = Iso(Monday), start = "10:45", end = "23:15" });

        var delivered = await DayAsync(client, Monday);

        Assert.Equal(1250m, delivered.GetProperty("earned").GetDecimal());
        Assert.Equal(version + 1, delivered.GetProperty("version").GetInt32());

        // A tip typed on the screen that read the close. Its echo of the plan
        // would take the delivered hours back off the pay with no word to anyone.
        var refused = await PutAsync(
            client,
            Monday,
            Entry(id, worked: true, actualStart: "11:00", actualEnd: "22:00", autoClosed: true),
            version,
            tips: 50m);

        Assert.Equal(System.Net.HttpStatusCode.Conflict, refused.StatusCode);
        Assert.Equal(1250m, (await DayAsync(client, Monday)).GetProperty("earned").GetDecimal());
    }

    [Fact]
    public async Task A_delivery_saying_nothing_new_moves_no_version()
    {
        var (client, login) = await api.SignInAsync("samehours");
        var id = await TemplateUnderBreakRuleAsync(client, "22:00");
        var user = await UserIdAsync(login);

        await MergeAsync(user, Delivered(id, 11, 0, 22, 0));

        var version = (await DayAsync(client, Monday)).GetProperty("version").GetInt32();

        // A sender retrying. A 409 here would land on a panel nobody touched.
        await MergeAsync(user, Delivered(id, 11, 0, 22, 0));

        Assert.Equal(version, (await DayAsync(client, Monday)).GetProperty("version").GetInt32());
    }

    [Fact]
    public async Task A_delivery_onto_an_empty_day_stops_a_screen_that_saw_it_empty()
    {
        var (client, login) = await api.SignInAsync("emptyheld");
        var id = await TemplateUnderBreakRuleAsync(client, "22:00");

        await MergeAsync(await UserIdAsync(login), Delivered(id, 11, 0, 22, 0));

        // No row yet reads as version zero, so a day the delivery opened at
        // zero would let this save carry its empty hands over the placement.
        var refused = await PutAsync(client, Monday, Entry(id), version: 0);

        Assert.Equal(System.Net.HttpStatusCode.Conflict, refused.StatusCode);
    }

    [Fact]
    public async Task A_second_shift_landing_on_a_day_moves_the_version()
    {
        var (client, login) = await api.SignInAsync("secondshift");
        var id = await TemplateAsync(client);
        var other = await TemplateUnderBreakRuleAsync(client, "22:00");

        var version = (await SaveAsync(client, Monday, Entry(id))).GetProperty("version").GetInt32();

        await MergeAsync(await UserIdAsync(login), Delivered(other, 11, 0, 22, 0));

        var day = await DayAsync(client, Monday);

        Assert.Equal(2, day.GetProperty("shifts").GetArrayLength());
        Assert.Equal(version + 1, day.GetProperty("version").GetInt32());
    }

    [Fact]
    public async Task Tips_delivered_stop_a_screen_holding_the_day_and_a_repeat_moves_nothing()
    {
        var (client, _) = await api.SignInAsync("tilltips");
        var id = await TemplateAsync(client);

        var version = (await SaveAsync(client, Monday, Entry(id, worked: true)))
            .GetProperty("version").GetInt32();

        var till = await TillAsync(client, id, "sales");

        await DeliverAsync(till, new { date = Iso(Monday), tips = 300m });

        var tipped = await DayAsync(client, Monday);

        Assert.Equal(300m, tipped.GetProperty("tips").GetDecimal());
        Assert.Equal(version + 1, tipped.GetProperty("version").GetInt32());

        var refused = await PutAsync(client, Monday, Entry(id, worked: true), version);

        Assert.Equal(System.Net.HttpStatusCode.Conflict, refused.StatusCode);

        await DeliverAsync(till, new { date = Iso(Monday), tips = 300m });

        Assert.Equal(version + 1, (await DayAsync(client, Monday)).GetProperty("version").GetInt32());
    }

    // ==== Writes that take a placement off, or put one on, past a save ====

    /// <summary>A save with nothing on the day but the money and the note, as a screen holding the day from before would send it.</summary>
    private static Task<HttpResponseMessage> BareSaveAsync(
        HttpClient client, DateOnly date, int? version, decimal? tips = null, string? note = null)
        => client.PutAsJsonAsync($"/shifter/v1/days/{Iso(date)}", new
        {
            shifts = Array.Empty<object>(),
            sales = Array.Empty<object>(),
            tips,
            tips_cash = (decimal?)null,
            deductions = 0m,
            deduction_reason = (string?)null,
            note,
            version,
        });

    private static async Task<int> PaintAsync(HttpClient client, DateOnly date, int id, string mode)
    {
        var painted = await Read(await client.PostAsJsonAsync(
            "/shifter/v1/days/bulk",
            new { dates = new[] { Iso(date) }, shift_id = id, mode }));

        return painted.GetArrayLength() == 0 ? 0 : painted[0].GetProperty("version").GetInt32();
    }

    [Fact]
    public async Task Painting_a_shift_on_stops_a_screen_holding_the_day_from_undoing_it()
    {
        var (client, _) = await api.SignInAsync("paintstale");
        var id = await TemplateAsync(client);
        var date = new DateOnly(2025, 4, 7);

        var held = (await Read(await BareSaveAsync(client, date, version: 0, note: "тихо")))
            .GetProperty("version").GetInt32();

        Assert.Equal(held + 1, await PaintAsync(client, date, id, "add"));

        var stale = await BareSaveAsync(client, date, held, tips: 50m);

        Assert.Equal(System.Net.HttpStatusCode.Conflict, stale.StatusCode);
        Assert.Equal(1100m, (await DayAsync(client, date)).GetProperty("earned").GetDecimal());
    }

    [Fact]
    public async Task Painting_a_shift_off_stops_a_screen_holding_the_day_from_putting_it_back()
    {
        var (client, _) = await api.SignInAsync("unpaintstale");
        var id = await TemplateAsync(client);
        var date = new DateOnly(2025, 4, 7);

        var held = (await SaveAsync(client, date, Entry(id, worked: true))).GetProperty("version").GetInt32();

        Assert.Equal(held + 1, await PaintAsync(client, date, id, "remove"));

        var stale = await PutAsync(client, date, Entry(id, worked: true), held);

        Assert.Equal(System.Net.HttpStatusCode.Conflict, stale.StatusCode);
        Assert.Equal(0, (await DayAsync(client, date)).GetProperty("shifts").GetArrayLength());
    }

    [Fact]
    public async Task A_stroke_that_changes_nothing_moves_nothing_and_a_row_it_makes_starts_at_one()
    {
        var (client, _) = await api.SignInAsync("paintsame");
        var id = await TemplateAsync(client);
        var date = new DateOnly(2025, 4, 7);

        Assert.Equal(1, await PaintAsync(client, date, id, "add"));
        Assert.Equal(1, await PaintAsync(client, date, id, "add"));

        var other = await TemplateAsync(client);

        Assert.Equal(1, await PaintAsync(client, date, other, "remove"));
    }

    /// <summary>Two people in one crew, each with a template and a planned shift on `date`.</summary>
    private async Task<(int Team, HttpClient Owner, HttpClient Other, int OwnerShift, int OtherShift)> CrewAsync(
        string name, DateOnly date, bool needsCover = false)
    {
        var (owner, _) = await api.SignInAsync($"{name}owner");
        var (other, _) = await api.SignInAsync($"{name}other");

        var team = await Read(await owner.PostAsJsonAsync("/shifter/v1/teams", new { name = "Смена" }));

        await Read(await other.PostAsJsonAsync("/shifter/v1/teams/join", new
        {
            invite_code = team.GetProperty("invite_code").GetString(),
            display_name = "Олег",
        }));

        var ownerShift = await TemplateAsync(owner);
        var otherShift = await TemplateAsync(other);

        await SaveAsync(owner, date, Entry(ownerShift, needsCover: needsCover));
        await SaveAsync(other, date, Entry(otherShift));

        return (team.GetProperty("id").GetInt32(), owner, other, ownerShift, otherShift);
    }

    private async Task<int> PlacementAsync(int shiftId)
    {
        var id = 0;

        await WithDbAsync(async db => id = await db.DayShifts
            .Where(entry => entry.ShiftId == shiftId)
            .Select(entry => entry.Id)
            .SingleAsync(TestContext.Current.CancellationToken));

        return id;
    }

    [Fact]
    public async Task An_accepted_swap_moves_both_days_so_neither_screen_puts_its_shift_back()
    {
        var date = Monday.AddDays(21);
        var (team, owner, other, ownerShift, otherShift) = await CrewAsync("swap", date);

        var ownerHeld = (await DayAsync(owner, date)).GetProperty("version").GetInt32();
        var otherHeld = (await DayAsync(other, date)).GetProperty("version").GetInt32();

        var swap = await Read(await owner.PostAsJsonAsync($"/shifter/v1/teams/{team}/swaps", new
        {
            my_day_shift_id = await PlacementAsync(ownerShift),
            their_day_shift_id = await PlacementAsync(otherShift),
            note = (string?)null,
        }));

        await Read(await other.PostAsJsonAsync(
            $"/shifter/v1/teams/{team}/swaps/{swap.GetProperty("id").GetInt32()}/accept", new { }));

        Assert.Equal(
            System.Net.HttpStatusCode.Conflict,
            (await PutAsync(owner, date, Entry(ownerShift), ownerHeld)).StatusCode);
        Assert.Equal(
            System.Net.HttpStatusCode.Conflict,
            (await PutAsync(other, date, Entry(otherShift), otherHeld)).StatusCode);
    }

    [Fact]
    public async Task A_shift_handed_over_moves_its_day_so_a_screen_does_not_put_it_back()
    {
        var date = Monday.AddDays(22);
        var (team, owner, other, ownerShift, _) = await CrewAsync("cover", date, needsCover: true);

        var held = (await DayAsync(owner, date)).GetProperty("version").GetInt32();

        var offer = await Read(await other.PostAsJsonAsync(
            $"/shifter/v1/teams/{team}/cover/{await PlacementAsync(ownerShift)}", new { }));

        await Read(await owner.PostAsJsonAsync(
            $"/shifter/v1/teams/{team}/cover/offers/{offer.GetProperty("offer_id").GetInt32()}/accept", new { }));

        Assert.Equal(
            System.Net.HttpStatusCode.Conflict,
            (await PutAsync(owner, date, Entry(ownerShift), held)).StatusCode);
    }

    [Fact]
    public async Task Accepting_a_rota_entry_leaves_a_shift_finished_by_hand_worked()
    {
        var date = Monday.AddDays(23);
        var (team, manager, worker, _, shift) = await CrewAsync("rota", date);
        var user = await UserIdAsync(await WorkerLoginAsync(shift));

        await SaveAsync(worker, date, Entry(shift, worked: true, actualStart: "11:00", actualEnd: "20:00"));

        var assignment = await Read(await manager.PostAsJsonAsync(
            $"/shifter/v1/teams/{team}/planner/assignments",
            new { user_id = user, date = Iso(date), title = "Бар", start = "11:00", end = "20:00", note = (string?)null }));

        await Read(await manager.PostAsync(
            $"/shifter/v1/teams/{team}/planner/publish?from={Iso(date)}&to={Iso(date)}", null));

        await Read(await worker.PostAsJsonAsync(
            $"/shifter/v1/teams/{team}/planner/assignments/{assignment.GetProperty("id").GetInt32()}/accept",
            new { template_id = shift }));

        var day = await DayAsync(worker, date);

        Assert.True(day.GetProperty("shifts")[0].GetProperty("worked").GetBoolean());
        Assert.Equal(900m, day.GetProperty("earned").GetDecimal());
    }

    private async Task<string> WorkerLoginAsync(int shiftId)
    {
        var login = "";

        await WithDbAsync(async db => login = await db.Shifts
            .Where(shift => shift.Id == shiftId)
            .Join(db.Users, shift => shift.UserId, user => user.Id, (_, user) => user.Login)
            .SingleAsync(TestContext.Current.CancellationToken));

        return login;
    }

    // ==== Painting under the place's rule ====

    [Fact]
    public async Task Painting_a_past_date_prices_the_same_as_saving_it()
    {
        var (client, _) = await api.SignInAsync("paintbreak");
        var id = await TemplateUnderBreakRuleAsync(client, "22:00");
        var painted = new DateOnly(2025, 3, 3);
        var saved = painted.AddDays(1);

        await Read(await client.PostAsJsonAsync(
            "/shifter/v1/days/bulk",
            new { dates = new[] { Iso(painted) }, shift_id = id, mode = "add" }));

        await SaveAsync(client, saved, Entry(id, worked: true));

        var byPaint = await DayAsync(client, painted);
        var bySave = await DayAsync(client, saved);

        Assert.True(byPaint.GetProperty("shifts")[0].GetProperty("worked").GetBoolean());
        Assert.Equal(30, byPaint.GetProperty("shifts")[0].GetProperty("break_minutes").GetInt32());
        Assert.Equal(2100m, byPaint.GetProperty("earned").GetDecimal());
        Assert.Equal(bySave.GetProperty("earned").GetDecimal(), byPaint.GetProperty("earned").GetDecimal());
    }

    [Fact]
    public async Task Painting_a_shift_too_short_for_the_rule_leaves_it_its_own_break()
    {
        var (client, _) = await api.SignInAsync("paintshort");
        var id = await TemplateUnderBreakRuleAsync(client, "15:00");

        var painted = await Read(await client.PostAsJsonAsync(
            "/shifter/v1/days/bulk",
            new { dates = new[] { Iso(new DateOnly(2025, 3, 3)) }, shift_id = id, mode = "add" }));

        Assert.Equal(0, painted[0].GetProperty("shifts")[0].GetProperty("break_minutes").GetInt32());
    }

    /// <summary>An endpoint landing on this template, with the address and the key a till posts with.</summary>
    private static async Task<(string Path, string Secret)> TillAsync(
        HttpClient client, int shiftId, string kind = "hours")
    {
        var made = await Read(await client.PostAsJsonAsync("/shifter/v1/webhooks", new
        {
            name = "Касса",
            kind,
            active = true,
            default_shift_id = shiftId,
            mapping = (string?)null,
        }));

        return (made.GetProperty("url_path").GetString()!, made.GetProperty("secret").GetString()!);
    }

    /// <summary>Posts what a till posts: no session, only the endpoint's key.</summary>
    private async Task DeliverAsync((string Path, string Secret) till, object body)
    {
        using var sender = api.CreateClient();
        using var request = new HttpRequestMessage(HttpMethod.Post, till.Path)
        {
            Content = JsonContent.Create(body),
        };

        request.Headers.Add(WebhookSignature.SecretHeader, till.Secret);

        await Read(await sender.SendAsync(request));
    }

    /// <summary>Hours arriving for a template at 200 an hour, with its break of none, the way every delivery route builds them.</summary>
    private static DayShift Delivered(int shiftId, int fromHour, int fromMinute, int toHour, int toMinute) => new()
    {
        ShiftId = shiftId,
        SalaryPeriod = SalaryPeriod.Hour,
        SalaryAmount = 200m,
        StartTime = new TimeOnly(fromHour, fromMinute),
        EndTime = new TimeOnly(toHour, toMinute),
        Worked = true,
    };

    /// <summary>A template from 11:00 to 22:00 at 200 an hour, with no break of its own and no place.</summary>
    private static async Task<int> TemplateAt200Async(HttpClient client)
    {
        var made = await Read(await client.PostAsJsonAsync("/shifter/v1/shifts", new
        {
            name = "Вечер",
            symbol = (string?)null,
            location_id = (int?)null,
            start_time = "11:00",
            end_time = "22:00",
            salary_period = "hour",
            salary_amount = 200m,
            break_minutes = 0,
        }));

        return made.GetProperty("id").GetInt32();
    }

    /// <summary>A template from 11:00, paid 200 an hour with no break of its own, at a place taking 30 minutes off anything over six hours.</summary>
    private static async Task<int> TemplateUnderBreakRuleAsync(HttpClient client, string end)
    {
        var place = await Read(await client.PostAsJsonAsync("/shifter/v1/locations", new
        {
            name = "Ресторан",
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
            auto_break_after_hours = 6m,
            auto_break_minutes = 30,
        }));

        var made = await Read(await client.PostAsJsonAsync("/shifter/v1/shifts", new
        {
            name = "Вечер",
            symbol = (string?)null,
            location_id = place.GetProperty("id").GetInt32(),
            start_time = "11:00",
            end_time = end,
            salary_period = "hour",
            salary_amount = 200m,
            break_minutes = 0,
        }));

        return made.GetProperty("id").GetInt32();
    }

    private async Task MergeAsync(int userId, DayShift placement, DateOnly? date = null)
    {
        using var scope = api.Services.CreateScope();

        await scope.ServiceProvider.GetRequiredService<IShifterCommand>().MergeDayShiftAsync(
            userId, date ?? Monday, placement, new MergeTerms(), TestContext.Current.CancellationToken);
    }

    // ==== A start the plan was over by ====

    private static void AssertClosed(JsonElement shift, string start, string end, double hours)
    {
        Assert.True(shift.GetProperty("worked").GetBoolean());
        Assert.True(shift.GetProperty("auto_closed").GetBoolean());
        Assert.Equal(start, shift.GetProperty("actual_start").GetString());
        Assert.Equal(end, shift.GetProperty("actual_end").GetString());
        Assert.Equal(hours, shift.GetProperty("hours").GetDouble());
    }

    [Fact]
    public async Task A_start_after_the_plan_stops_at_the_limit_and_never_at_the_wrapped_close()
    {
        var (client, _) = await api.SignInAsync("latestart");
        var id = await TemplateAsync(client, "09:00", "17:00");

        await SaveAsync(client, Monday, Entry(id, actualStart: "18:00"));

        await PassAsync(Kyiv(Monday, 18, 5));
        await PassAsync(Kyiv(Monday.AddDays(1), 9, 59));

        Assert.False((await ShiftOnAsync(client, Monday)).GetProperty("worked").GetBoolean());

        await PassAsync(Kyiv(Monday.AddDays(1), 10, 0));

        AssertClosed(await ShiftOnAsync(client, Monday), "18:00", "10:00", 16);
        Assert.Equal(1600m, (await DayAsync(client, Monday)).GetProperty("earned").GetDecimal());
    }

    [Fact]
    public async Task A_start_the_shared_rule_would_put_on_the_evening_before_waits_for_its_own_evening()
    {
        var (client, _) = await api.SignInAsync("evenstart");
        var id = await TemplateAsync(client, "09:00", "17:00");

        await SaveAsync(client, Monday, Entry(id, actualStart: "22:00"));

        // The plan's close, hours ahead of the start the row names.
        await PassAsync(Kyiv(Monday, 17, 1));
        await PassAsync(Kyiv(Monday.AddDays(1), 13, 59));

        Assert.False((await ShiftOnAsync(client, Monday)).GetProperty("worked").GetBoolean());

        await PassAsync(Kyiv(Monday.AddDays(1), 14, 0));

        AssertClosed(await ShiftOnAsync(client, Monday), "22:00", "14:00", 16);
        Assert.Equal(1600m, (await DayAsync(client, Monday)).GetProperty("earned").GetDecimal());
    }

    [Fact]
    public async Task A_moved_shift_with_both_times_said_closes_on_them()
    {
        var (client, _) = await api.SignInAsync("bothmoved");
        var id = await TemplateAsync(client, "09:00", "17:00");

        await SaveAsync(client, Monday, Entry(id, actualStart: "22:00", actualEnd: "23:30"));

        await PassAsync(Kyiv(Monday, 23, 29));

        Assert.False((await ShiftOnAsync(client, Monday)).GetProperty("worked").GetBoolean());

        await PassAsync(Kyiv(Monday, 23, 31));

        AssertClosed(await ShiftOnAsync(client, Monday), "22:00", "23:30", 1.5);
    }

    [Fact]
    public async Task A_start_ahead_of_the_plan_still_closes_at_the_plan()
    {
        var (client, _) = await api.SignInAsync("earlystart");
        var id = await TemplateAsync(client, "09:00", "17:00");

        await SaveAsync(client, Monday, Entry(id, actualStart: "08:30"));

        await PassAsync(Kyiv(Monday, 17, 0));

        AssertClosed(await ShiftOnAsync(client, Monday), "08:30", "17:00", 8.5);
    }

    // ==== The place's rule on a save ====

    /// <summary>Sets a template's place's rule, as an edit of the place would.</summary>
    private Task RuleAsync(int shiftId, decimal afterHours, int minutes)
        => WithDbAsync(db => db.Locations
            .Where(place => db.Shifts.Any(shift => shift.Id == shiftId && shift.LocationId == place.Id))
            .ExecuteUpdateAsync(
                setters => setters
                    .SetProperty(place => place.AutoBreakAfterHours, afterHours)
                    .SetProperty(place => place.AutoBreakMinutes, minutes),
                TestContext.Current.CancellationToken));

    /// <summary>The break, hours and day's pay a read shows, for one line of assertion.</summary>
    private static (int Break, double Hours, decimal Earned) Money(JsonElement day)
    {
        var shift = day.GetProperty("shifts")[0];

        return (
            shift.GetProperty("break_minutes").GetInt32(),
            shift.GetProperty("hours").GetDouble(),
            day.GetProperty("earned").GetDecimal());
    }

    [Fact]
    public async Task A_rule_newer_than_the_day_takes_nothing_off_it_when_a_tip_is_typed()
    {
        var (client, _) = await api.SignInAsync("oldrule");
        var id = await TemplateUnderBreakRuleAsync(client, "22:00");
        var old = new DateOnly(2024, 3, 4);

        await RuleAsync(id, 0m, 0);
        await SaveAsync(client, old, Entry(id, worked: true, breakMinutes: 0));
        await RuleAsync(id, 6m, 30);

        Assert.Equal((0, 11d, 2200m), Money(await DayAsync(client, old)));

        Assert.Equal((0, 11d, 2250m), Money(await TipAsync(client, id, old)));
    }

    [Fact]
    public async Task A_rule_raised_since_leaves_the_break_the_day_already_holds()
    {
        var (client, _) = await api.SignInAsync("raisedrule");
        var id = await TemplateUnderBreakRuleAsync(client, "22:00");

        await SaveAsync(client, Monday, Entry(id, worked: true, breakMinutes: 0));
        await RuleAsync(id, 6m, 45);

        Assert.Equal((30, 10.5d, 2150m), Money(await TipAsync(client, id, Monday)));
    }

    [Fact]
    public async Task A_save_that_moves_the_hours_takes_the_rule_as_it_stands()
    {
        var (client, _) = await api.SignInAsync("movedrule");
        var id = await TemplateUnderBreakRuleAsync(client, "22:00");

        await RuleAsync(id, 0m, 0);

        var version = (await SaveAsync(client, Monday, Entry(id, worked: true, breakMinutes: 0)))
            .GetProperty("version").GetInt32();

        await RuleAsync(id, 6m, 30);

        var moved = await SaveAsync(
            client,
            Monday,
            Entry(id, worked: true, actualStart: "11:00", actualEnd: "21:00", breakMinutes: 0),
            version);

        Assert.Equal((30, 9.5d, 1900m), Money(moved));
    }

    [Fact]
    public async Task Finishing_a_shift_on_its_plan_takes_the_rule_the_close_would_have_taken()
    {
        var (client, _) = await api.SignInAsync("finishrule");
        var id = await TemplateUnderBreakRuleAsync(client, "22:00");

        await RuleAsync(id, 0m, 0);

        var version = (await SaveAsync(client, Monday, Entry(id, breakMinutes: 0)))
            .GetProperty("version").GetInt32();

        await RuleAsync(id, 6m, 30);

        Assert.Equal(
            (30, 10.5d, 2100m),
            Money(await SaveAsync(client, Monday, Entry(id, worked: true, breakMinutes: 0), version)));
    }

    [Fact]
    public async Task A_break_timed_shorter_than_the_one_assumed_still_replaces_it()
    {
        var (client, _) = await api.SignInAsync("timedbreak");
        var id = await TemplateUnderBreakRuleAsync(client, "22:00");

        await RuleAsync(id, 0m, 0);

        var version = (await SaveAsync(client, Monday, Entry(id, worked: true, breakMinutes: 45)))
            .GetProperty("version").GetInt32();

        Assert.Equal(
            (15, 10.75d, 2150m),
            Money(await SaveAsync(client, Monday, Entry(id, worked: true, breakMinutes: 15), version)));
    }

    [Fact]
    public async Task A_break_comes_down_no_further_than_the_rule_on_hours_it_covers()
    {
        var (client, _) = await api.SignInAsync("timedfloor");
        var id = await TemplateUnderBreakRuleAsync(client, "22:00");

        var version = (await SaveAsync(client, Monday, Entry(id, worked: true, breakMinutes: 45)))
            .GetProperty("version").GetInt32();

        Assert.Equal(
            (30, 10.5d, 2100m),
            Money(await SaveAsync(client, Monday, Entry(id, worked: true, breakMinutes: 15), version)));
    }

    // ==== A shift finished short of the rule ====

    [Fact]
    public async Task A_shift_finished_short_gives_back_the_break_the_rule_gave_its_length()
    {
        var (client, _) = await api.SignInAsync("shortfinish");
        var id = await TemplateUnderBreakRuleAsync(client, "22:00");

        var placed = await SaveAsync(client, Monday, Entry(id, breakMinutes: 0));

        Assert.Equal(30, placed.GetProperty("shifts")[0].GetProperty("break_minutes").GetInt32());

        // The clock nobody paused says nothing about the break: its echo goes back.
        var finished = await SaveAsync(
            client,
            Monday,
            Entry(id, worked: true, actualStart: "11:00", actualEnd: "15:00", breakMinutes: 30),
            placed.GetProperty("version").GetInt32());

        Assert.Equal((0, 4d, 800m), Money(finished));
    }

    [Fact]
    public async Task A_shift_finished_short_but_still_over_the_rule_keeps_it()
    {
        var (client, _) = await api.SignInAsync("shortover");
        var id = await TemplateUnderBreakRuleAsync(client, "22:00");

        var placed = await SaveAsync(client, Monday, Entry(id, breakMinutes: 0));

        var finished = await SaveAsync(
            client,
            Monday,
            Entry(id, worked: true, actualStart: "11:00", actualEnd: "19:00", breakMinutes: 30),
            placed.GetProperty("version").GetInt32());

        Assert.Equal((30, 7.5d, 1500m), Money(finished));
    }

    [Fact]
    public async Task A_break_of_anyone_s_own_stays_on_a_shift_finished_short()
    {
        var (client, _) = await api.SignInAsync("shortown");
        var id = await TemplateUnderBreakRuleAsync(client, "22:00");

        var placed = await SaveAsync(client, Monday, Entry(id, breakMinutes: 0));

        // A paused clock sends what it counted, which is not the row's.
        var paused = await SaveAsync(
            client,
            Monday,
            Entry(id, worked: true, actualStart: "11:00", actualEnd: "15:00", breakMinutes: 20),
            placed.GetProperty("version").GetInt32());

        Assert.Equal((20, 3.67d, 733.33m), (
            Money(paused).Break,
            Math.Round(Money(paused).Hours, 2),
            Math.Round(Money(paused).Earned, 2)));
    }

    [Fact]
    public async Task A_longer_break_than_the_rule_s_stays_when_the_hours_shorten()
    {
        var (client, _) = await api.SignInAsync("shortlong");
        var id = await TemplateUnderBreakRuleAsync(client, "22:00");

        var taken = await SaveAsync(client, Monday, Entry(id, breakMinutes: 45));

        var finished = await SaveAsync(
            client,
            Monday,
            Entry(id, worked: true, actualStart: "11:00", actualEnd: "15:00", breakMinutes: 45),
            taken.GetProperty("version").GetInt32());

        Assert.Equal((45, 3.25d, 650m), Money(finished));
    }

    [Fact]
    public async Task A_close_on_an_early_end_gives_back_the_break_the_rule_gave_the_plan()
    {
        var (client, _) = await api.SignInAsync("shortclose");
        var id = await TemplateUnderBreakRuleAsync(client, "22:00");

        await SaveAsync(client, Monday, Entry(id, actualEnd: "15:00", breakMinutes: 30));

        await PassAsync(Kyiv(Monday, 15, 0));

        Assert.Equal((0, 4d, 800m), Money(await DayAsync(client, Monday)));
    }

    [Fact]
    public async Task A_close_leaves_a_break_the_row_was_given_past_the_rule_s_minutes()
    {
        var (client, _) = await api.SignInAsync("shortcloseown");
        var id = await TemplateUnderBreakRuleAsync(client, "22:00");

        await SaveAsync(client, Monday, Entry(id, actualEnd: "15:00", breakMinutes: 45));

        await PassAsync(Kyiv(Monday, 15, 0));

        Assert.Equal((45, 3.25d, 650m), Money(await DayAsync(client, Monday)));
    }

    /// <summary>A tip typed into an open panel: the entry goes back as the panel shows it, its break echoed and no edges of its own.</summary>
    private static async Task<JsonElement> TipAsync(HttpClient client, int id, DateOnly date)
    {
        var day = await DayAsync(client, date);
        var shift = day.GetProperty("shifts")[0];

        return await SaveAsync(
            client,
            date,
            Entry(
                id,
                worked: shift.GetProperty("worked").GetBoolean(),
                breakMinutes: shift.GetProperty("break_minutes").GetInt32()),
            day.GetProperty("version").GetInt32(),
            tips: 50m);
    }

    [Fact]
    public async Task A_tip_on_counted_hours_moves_no_pay()
    {
        var (client, _) = await api.SignInAsync("tipcount");
        var id = await TemplateUnderBreakRuleAsync(client, "22:00");

        await DeliverAsync(await TillAsync(client, id), new { date = Iso(Monday), hours = 5 });

        Assert.Equal(1000m, (await DayAsync(client, Monday)).GetProperty("earned").GetDecimal());

        var tipped = await TipAsync(client, id, Monday);

        Assert.Equal(0, tipped.GetProperty("shifts")[0].GetProperty("break_minutes").GetInt32());
        Assert.Equal(1050m, tipped.GetProperty("earned").GetDecimal());
    }

    [Fact]
    public async Task A_tip_on_delivered_hours_moves_no_pay()
    {
        var (client, _) = await api.SignInAsync("tipspan");
        var id = await TemplateUnderBreakRuleAsync(client, "22:00");

        await DeliverAsync(
            await TillAsync(client, id),
            new { date = Iso(Monday), start = "17:00", end = "22:00" });

        Assert.Equal(1000m, (await DayAsync(client, Monday)).GetProperty("earned").GetDecimal());

        var tipped = await TipAsync(client, id, Monday);

        Assert.Equal(0, tipped.GetProperty("shifts")[0].GetProperty("break_minutes").GetInt32());
        Assert.Equal(1050m, tipped.GetProperty("earned").GetDecimal());
    }

    [Fact]
    public async Task A_tip_on_a_short_rota_day_takes_no_break_off_it()
    {
        var (client, login) = await api.SignInAsync("tiprota");
        var id = await TemplateUnderBreakRuleAsync(client, "22:00");

        // What the planner writes when somebody accepts a rota entry.
        DayShift rota = Delivered(id, 11, 0, 16, 0);

        rota.Worked = false;

        await MergeAsync(await UserIdAsync(login), rota);

        var tipped = await TipAsync(client, id, Monday);

        Assert.Equal(0, tipped.GetProperty("shifts")[0].GetProperty("break_minutes").GetInt32());
    }

    [Fact]
    public async Task A_tip_on_an_old_day_ignores_what_the_template_became()
    {
        var (client, _) = await api.SignInAsync("tipold");
        var id = await TemplateUnderBreakRuleAsync(client, "16:00");
        var old = new DateOnly(2024, 3, 4);

        Assert.Equal(1000m, (await SaveAsync(client, old, Entry(id, worked: true))).GetProperty("earned").GetDecimal());

        var template = (await Read(await client.GetAsync("/shifter/v1/shifts")))[0];

        // Longer since, and over the line the place draws.
        await Read(await client.PutAsJsonAsync($"/shifter/v1/shifts/{id}", new
        {
            name = "Вечер",
            symbol = (string?)null,
            location_id = template.GetProperty("location_id").GetInt32(),
            start_time = "11:00",
            end_time = "22:00",
            salary_period = "hour",
            salary_amount = 200m,
            break_minutes = 0,
        }));

        var tipped = await TipAsync(client, id, old);

        Assert.Equal(0, tipped.GetProperty("shifts")[0].GetProperty("break_minutes").GetInt32());
        Assert.Equal(1050m, tipped.GetProperty("earned").GetDecimal());
    }

    [Fact]
    public async Task A_long_shift_on_a_short_template_keeps_the_rule_through_a_save()
    {
        var (client, login) = await api.SignInAsync("tiplong");
        var id = await TemplateUnderBreakRuleAsync(client, "16:00");

        await MergeAsync(await UserIdAsync(login), Delivered(id, 11, 0, 22, 0));

        var day = await DayAsync(client, Monday);

        Assert.Equal(2100m, day.GetProperty("earned").GetDecimal());

        // A client that lost the minutes cannot talk the pay up either.
        var saved = await SaveAsync(
            client,
            Monday,
            Entry(id, worked: true, breakMinutes: 0),
            day.GetProperty("version").GetInt32());

        Assert.Equal(30, saved.GetProperty("shifts")[0].GetProperty("break_minutes").GetInt32());
        Assert.Equal(2100m, saved.GetProperty("earned").GetDecimal());
    }

    [Fact]
    public async Task A_save_that_never_saw_the_close_is_weighed_on_the_edges_the_close_left()
    {
        var (client, login) = await api.SignInAsync("staleweigh");
        var id = await TemplateUnderBreakRuleAsync(client, "22:00");

        // Five hours on the rota, and Фактически set to a start five hours sooner.
        DayShift rota = Delivered(id, 17, 0, 22, 0);

        rota.Worked = false;

        await MergeAsync(await UserIdAsync(login), rota);

        var version = (await SaveAsync(client, Monday, Entry(id, actualStart: "12:00", breakMinutes: 0)))
            .GetProperty("version").GetInt32();

        await PassAsync(Kyiv(Monday, 22, 0));

        Assert.Equal(1900m, (await DayAsync(client, Monday)).GetProperty("earned").GetDecimal());

        // The merge keeps the close's ten hours, so those are what the rule
        // reads, not the five the plan alone would give.
        var saved = await SaveAsync(
            client,
            Monday,
            Entry(id, actualStart: "12:00", breakMinutes: 0),
            version);

        Assert.Equal(30, saved.GetProperty("shifts")[0].GetProperty("break_minutes").GetInt32());
        Assert.Equal(1900m, saved.GetProperty("earned").GetDecimal());
    }

    // ==== Saves meeting a close ====

    [Fact]
    public async Task A_save_that_never_saw_the_close_does_not_undo_it_and_is_not_a_conflict()
    {
        var (client, _) = await api.SignInAsync("stalesave");
        var id = await TemplateAsync(client);

        var version = (await SaveAsync(client, Monday, Entry(id))).GetProperty("version").GetInt32();

        await PassAsync(Kyiv(Monday, 22, 0));

        // The panel was open all along, and somebody types tips into it.
        var saved = await SaveAsync(client, Monday, Entry(id, revenue: 9_000m), version, tips: 300m);
        var shift = saved.GetProperty("shifts")[0];

        Assert.True(shift.GetProperty("worked").GetBoolean());
        Assert.Equal("11:00", shift.GetProperty("actual_start").GetString());
        Assert.Equal("22:00", shift.GetProperty("actual_end").GetString());
        Assert.True(shift.GetProperty("auto_closed").GetBoolean());
        Assert.Equal(9_000m, shift.GetProperty("revenue").GetDecimal());
        Assert.Equal(300m, saved.GetProperty("tips").GetDecimal());
    }

    [Fact]
    public async Task A_live_clock_finishing_after_the_close_still_gets_its_real_times_in()
    {
        var (client, _) = await api.SignInAsync("liveclock");
        var id = await TemplateAsync(client);

        var version = (await SaveAsync(client, Monday, Entry(id))).GetProperty("version").GetInt32();

        await PassAsync(Kyiv(Monday, 22, 0));

        var saved = await SaveAsync(
            client, Monday, Entry(id, worked: true, actualStart: "11:20", actualEnd: "22:40"), version);

        var shift = saved.GetProperty("shifts")[0];

        Assert.Equal("11:20", shift.GetProperty("actual_start").GetString());
        Assert.Equal("22:40", shift.GetProperty("actual_end").GetString());
    }

    [Fact]
    public async Task A_save_that_saw_the_close_can_flip_it_back_and_the_next_pass_leaves_it()
    {
        var (client, _) = await api.SignInAsync("flipback");
        var id = await TemplateAsync(client);

        await SaveAsync(client, Monday, Entry(id));
        await PassAsync(Kyiv(Monday, 22, 0));

        var day = await DayAsync(client, Monday);

        var flipped = await SaveAsync(
            client,
            Monday,
            Entry(id, worked: false, autoClosed: true),
            day.GetProperty("version").GetInt32());

        Assert.False(flipped.GetProperty("shifts")[0].GetProperty("worked").GetBoolean());

        await PassAsync(Kyiv(Monday, 22, 5));

        var shift = await ShiftOnAsync(client, Monday);

        Assert.False(shift.GetProperty("worked").GetBoolean());
        Assert.True(shift.GetProperty("auto_closed").GetBoolean());
        Assert.Equal(JsonValueKind.Null, shift.GetProperty("actual_start").ValueKind);
    }

    [Fact]
    public async Task A_discard_tells_the_job_to_leave_the_shift_alone()
    {
        var (client, _) = await api.SignInAsync("discard");
        var id = await TemplateAsync(client);

        // A manual start wrote its edge straight away.
        var version = (await SaveAsync(client, Monday, Entry(id, actualStart: "11:05")))
            .GetProperty("version").GetInt32();

        var discarded = await SaveAsync(
            client, Monday, Entry(id, worked: false, autoClosed: true), version);

        var shift = discarded.GetProperty("shifts")[0];

        Assert.False(shift.GetProperty("worked").GetBoolean());
        Assert.True(shift.GetProperty("auto_closed").GetBoolean());
        Assert.Equal(JsonValueKind.Null, shift.GetProperty("actual_start").ValueKind);

        await PassAsync(Kyiv(Monday, 23, 0));

        Assert.False((await ShiftOnAsync(client, Monday)).GetProperty("worked").GetBoolean());
    }
}
