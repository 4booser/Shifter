using System.Net.Http.Json;
using System.Text.Json;

using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging.Abstractions;

using Shifter.Application.Common.Time;
using Shifter.Application.Features.business.Services;
using Shifter.Domain.Entities;
using Shifter.Infrastructure.Persistence.DbContexts;

using Xunit;

namespace Shifter.Api.Tests;

/// <summary>A day's history under autosave, against the real Postgres: the fold is one SQL statement, so a fake could not vouch for it.</summary>
[Collection("api")]
public sealed class DayHistoryOverHttpTests(Api api)
{
    private static readonly DateOnly Date = new(2026, 3, 2);

    private static readonly DateTime Noon = new(2026, 3, 2, 12, 0, 0, DateTimeKind.Utc);

    private sealed class Stopped(DateTime now) : TimeProvider
    {
        public override DateTimeOffset GetUtcNow() => new(now);
    }

    private static async Task<JsonElement> Read(HttpResponseMessage response)
    {
        var body = await response.Content.ReadAsStringAsync();

        Assert.True(
            response.IsSuccessStatusCode,
            $"{(int)response.StatusCode} {response.RequestMessage?.RequestUri}: {body}");

        return JsonDocument.Parse(body).RootElement.Clone();
    }

    private static async Task<int> TemplateAsync(HttpClient client, string start, string end)
    {
        var made = await Read(await client.PostAsJsonAsync("/shifter/v1/shifts", new
        {
            name = $"Смена {start}",
            symbol = (string?)null,
            location_id = (int?)null,
            start_time = start,
            end_time = end,
            salary_period = "hour",
            salary_amount = 100m,
            break_minutes = 0,
        }));

        return made.GetProperty("id").GetInt32();
    }

    private static async Task<int> SaleAsync(HttpClient client)
    {
        var made = await Read(await client.PostAsJsonAsync(
            "/shifter/v1/sales", new { name = "Вино", price = 300m, percentage = 10m }));

        return made.GetProperty("id").GetInt32();
    }

    private static Task<JsonElement> SaveAsync(HttpClient client, int[] shifts, decimal tips, (int Id, int Quantity)? sold = null)
        => client.PutAsJsonAsync($"/shifter/v1/days/{Date:yyyy-MM-dd}", new
        {
            shifts = shifts.Select(id => new { shift_id = id, worked = true }).ToArray(),
            sales = sold is { } sale
                ? new[] { new { sales_id = sale.Id, quantity = sale.Quantity } }
                : [],
            tips,
            tips_cash = (decimal?)null,
            deductions = 0m,
            deduction_reason = (string?)null,
            note = (string?)null,
        }).ContinueWith(sent => Read(sent.Result)).Unwrap();

    private static async Task<JsonElement[]> HistoryAsync(HttpClient client)
        => (await Read(await client.GetAsync($"/shifter/v1/days/{Date:yyyy-MM-dd}/history")))
            .GetProperty("entries").EnumerateArray().ToArray();

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

    private async Task<int> SomebodyAsync(string who) => await UserIdAsync((await api.SignInAsync(who)).Login);

    /// <summary>One write at a moment the test chose, through the writer the server uses.</summary>
    private Task WriteAsync(int userId, decimal tips, DateTime at, string source = "app", DateOnly? date = null)
        => WithDbAsync(db => new DayAuditWriter(db, NullLogger<DayAuditWriter>.Instance, new AppClock(time: new Stopped(at)))
            .WriteAsync(
                userId,
                new Day { UserId = userId, Date = date ?? Date, Tips = tips },
                source,
                TestContext.Current.CancellationToken));

    /// <summary>A line laid down the way the close job does it, past the writer.</summary>
    private Task LayLineAsync(int userId, decimal tips, DateTime at, string source)
        => WithDbAsync(db =>
        {
            DayAudit line = DayAuditWriter.Line(userId, new Day { UserId = userId, Date = Date, Tips = tips }, source);

            line.At = at;
            db.DayAudits.Add(line);

            return db.SaveChangesAsync(TestContext.Current.CancellationToken);
        });

    /// <summary>A person's lines, oldest first.</summary>
    private async Task<DayAudit[]> LinesAsync(int userId)
    {
        DayAudit[] lines = [];

        await WithDbAsync(async db => lines = await db.DayAudits
            .AsNoTracking()
            .Where(audit => audit.UserId == userId)
            .OrderBy(audit => audit.At)
            .ThenBy(audit => audit.Id)
            .ToArrayAsync(TestContext.Current.CancellationToken));

        return lines;
    }

    [Fact]
    public async Task A_burst_of_saves_is_one_line_holding_what_the_last_one_left()
    {
        var (client, _) = await api.SignInAsync("burst");
        var morning = await TemplateAsync(client, "08:00", "12:00");
        var evening = await TemplateAsync(client, "13:00", "17:00");
        var sale = await SaleAsync(client);

        await SaveAsync(client, [morning], 100m, (sale, 1));
        await SaveAsync(client, [morning, evening], 150m, (sale, 3));

        var line = Assert.Single(await HistoryAsync(client));

        // Every figure moves on, not only the one being typed into: a line
        // says what the whole day held after the newest save in it.
        Assert.Equal("app", line.GetProperty("source").GetString());
        Assert.Equal(2, line.GetProperty("shift_count").GetInt32());
        Assert.Equal(2, line.GetProperty("worked_count").GetInt32());
        Assert.Equal(8d, line.GetProperty("hours").GetDouble());
        Assert.Equal(800m, line.GetProperty("earned").GetDecimal());
        Assert.Equal(150m, line.GetProperty("tips").GetDecimal());
        Assert.Equal(3, line.GetProperty("sales_units").GetInt32());
    }

    [Fact]
    public async Task A_burst_cannot_push_real_history_off_the_view()
    {
        var (client, login) = await api.SignInAsync("burstview");
        var userId = await UserIdAsync(login);
        var shift = await TemplateAsync(client, "10:00", "18:00");

        await SaveAsync(client, [shift], 100m);

        await WithDbAsync(db => db.DayAudits
            .Where(audit => audit.UserId == userId)
            .ExecuteUpdateAsync(
                set => set.SetProperty(audit => audit.At, audit => audit.At.AddHours(-1)),
                TestContext.Current.CancellationToken));

        // More saves than the endpoint's fifty lines, at the autosave's pace.
        for (var tips = 101m; tips <= 160m; tips++)
            await SaveAsync(client, [shift], tips);

        var trail = await HistoryAsync(client);

        Assert.Equal(2, trail.Length);
        Assert.Equal(160m, trail[0].GetProperty("tips").GetDecimal());
        Assert.Equal(100m, trail[1].GetProperty("tips").GetDecimal());
    }

    [Fact]
    public async Task A_line_just_under_two_minutes_old_takes_the_save()
    {
        var userId = await SomebodyAsync("foldyoung");
        var at = Noon.AddMinutes(2).AddMilliseconds(-1);

        await WriteAsync(userId, 100m, Noon);
        await WriteAsync(userId, 150m, at);

        var line = Assert.Single(await LinesAsync(userId));

        // At moves with the snapshot, so the line still says truthfully when
        // the day held these figures, and sorts above whatever came between.
        Assert.Equal(150m, line.Tips);
        Assert.Equal(at, line.At);
    }

    [Fact]
    public async Task A_line_two_minutes_old_is_left_as_it_was()
    {
        var userId = await SomebodyAsync("foldold");

        await WriteAsync(userId, 100m, Noon);
        await WriteAsync(userId, 150m, Noon.AddMinutes(2));

        var lines = await LinesAsync(userId);

        Assert.Equal(2, lines.Length);
        Assert.Equal((Noon, 100m), (lines[0].At, lines[0].Tips));
        Assert.Equal((Noon.AddMinutes(2), 150m), (lines[1].At, lines[1].Tips));
    }

    [Fact]
    public async Task A_line_is_as_old_as_the_newest_save_in_it()
    {
        var userId = await SomebodyAsync("foldrun");

        await WriteAsync(userId, 100m, Noon);
        await WriteAsync(userId, 110m, Noon.AddSeconds(90));
        await WriteAsync(userId, 120m, Noon.AddSeconds(180));

        Assert.Equal(120m, Assert.Single(await LinesAsync(userId)).Tips);
    }

    [Theory]
    [InlineData("webhook")]
    [InlineData("assignment")]
    [InlineData("telegram")]
    public async Task A_different_source_always_appends(string source)
    {
        var userId = await SomebodyAsync("foldsource");

        await WriteAsync(userId, 100m, Noon);
        await WriteAsync(userId, 150m, Noon.AddSeconds(30), source);

        var lines = await LinesAsync(userId);

        Assert.Equal(2, lines.Length);
        Assert.Equal(("app", 100m), (lines[0].Source, lines[0].Tips));
        Assert.Equal((source, 150m), (lines[1].Source, lines[1].Tips));
    }

    [Fact]
    public async Task A_save_reaches_past_another_sources_line_to_its_own()
    {
        var userId = await SomebodyAsync("foldpast");

        await WriteAsync(userId, 100m, Noon);
        await LayLineAsync(userId, 100m, Noon.AddSeconds(30), "auto");
        await WriteAsync(userId, 150m, Noon.AddSeconds(60));

        var lines = await LinesAsync(userId);

        // The close keeps its line untouched, and the save still ends on top,
        // so the newest line on screen is what the day really holds.
        Assert.Equal(2, lines.Length);
        Assert.Equal(("auto", 100m, Noon.AddSeconds(30)), (lines[0].Source, lines[0].Tips, lines[0].At));
        Assert.Equal(("app", 150m, Noon.AddSeconds(60)), (lines[1].Source, lines[1].Tips, lines[1].At));
    }

    [Fact]
    public async Task Another_date_or_another_person_is_never_folded_into()
    {
        var first = await SomebodyAsync("foldfirst");
        var second = await SomebodyAsync("foldsecond");

        await WriteAsync(first, 100m, Noon);
        await WriteAsync(first, 150m, Noon.AddSeconds(30), date: Date.AddDays(1));
        await WriteAsync(second, 200m, Noon.AddSeconds(30));

        var firsts = await LinesAsync(first);

        Assert.Equal(2, firsts.Length);
        Assert.Equal((Date, 100m), (firsts[0].Date, firsts[0].Tips));
        Assert.Equal((Date.AddDays(1), 150m), (firsts[1].Date, firsts[1].Tips));
        Assert.Equal(200m, Assert.Single(await LinesAsync(second)).Tips);
    }

    [Fact]
    public async Task Only_the_newest_line_takes_the_save()
    {
        var userId = await SomebodyAsync("foldnewest");

        // Two fresh lines from one source: what two devices saving together leave.
        await LayLineAsync(userId, 100m, Noon, "app");
        await LayLineAsync(userId, 110m, Noon.AddSeconds(1), "app");

        await WriteAsync(userId, 150m, Noon.AddSeconds(30));

        var lines = await LinesAsync(userId);

        Assert.Equal(2, lines.Length);
        Assert.Equal((Noon, 100m), (lines[0].At, lines[0].Tips));
        Assert.Equal((Noon.AddSeconds(30), 150m), (lines[1].At, lines[1].Tips));
    }
}
