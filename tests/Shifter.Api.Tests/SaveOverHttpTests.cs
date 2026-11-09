using System.Net.Http.Json;
using System.Text.Json;

using Microsoft.AspNetCore.TestHost;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

using Shifter.Application.Features.Push;
using Shifter.Domain.Entities;
using Shifter.Infrastructure.Persistence.DbContexts;
using Shifter.Infrastructure.Repositories.Interfaces;

using Xunit;

namespace Shifter.Api.Tests;

/// <summary>What a save has to keep promising now that it answers without pricing the goals.</summary>
[Collection("api")]
public sealed class SaveOverHttpTests(Api api)
{
    private const string Date = "2031-05-14";

    /// <summary>A phone that keeps the worker standing there until the test lets go.</summary>
    private sealed class HeldPush : IPushNotifier
    {
        private readonly TaskCompletionSource _gate =
            new(TaskCreationOptions.RunContinuationsAsynchronously);

        private int _asked;

        public int Asked => Volatile.Read(ref _asked);

        public void Release() => _gate.TrySetResult();

        public async Task NotifyAsync(
            int userId,
            Func<string, (string Title, string Body)> text,
            string url,
            CancellationToken ct,
            string? category = null)
        {
            Interlocked.Increment(ref _asked);

            await _gate.Task.WaitAsync(ct);
        }
    }

    private static async Task<JsonElement> Read(HttpResponseMessage response)
    {
        var body = await response.Content.ReadAsStringAsync();

        Assert.True(
            response.IsSuccessStatusCode,
            $"{(int)response.StatusCode} {response.RequestMessage?.RequestUri}: {body}");

        return JsonDocument.Parse(body).RootElement.Clone();
    }

    private static async Task<int> TemplateAsync(HttpClient client, int? place = null, decimal hourly = 100m)
    {
        var made = await Read(await client.PostAsJsonAsync("/shifter/v1/shifts", new
        {
            name = "Смена",
            symbol = (string?)null,
            location_id = place,
            start_time = "10:00",
            end_time = "18:00",
            salary_period = "hour",
            salary_amount = hourly,
            break_minutes = 0,
        }));

        return made.GetProperty("id").GetInt32();
    }

    private static async Task<int> PlaceAsync(HttpClient client)
    {
        var made = await Read(await client.PostAsJsonAsync("/shifter/v1/locations", new
        {
            name = "Бар",
            address = (string?)null,
            colour = "#1F3A5F",
            pay_period = "monthly",
            pay_day = 10,
            pay_anchor = (DateOnly?)null,
            overtime_weekly_hours = 40d,
            overtime_multiplier = 1.5m,
            night_multiplier = 1m,
            night_from = "22:00",
            night_to = "06:00",
            public_holiday_multiplier = 1m,
            holiday_country = "",
            tip_out_of_tips_percent = 5m,
            tip_out_of_sales_percent = 3m,
            meal_deduction = 80m,
            tax_percent = 5m,
            tax_tips = false,
            holiday_percent = 8m,
            currency = (string?)null,
            minimum_hourly = 500m,
        }));

        return made.GetProperty("id").GetInt32();
    }

    private static async Task<int> PositionAsync(HttpClient client, string name, decimal price)
    {
        var made = await Read(await client.PostAsJsonAsync(
            "/shifter/v1/sales", new { name, price, percentage = 10m }));

        return made.GetProperty("id").GetInt32();
    }

    private static async Task<JsonElement> SaveAsync(
        HttpClient client,
        int[] shifts,
        decimal tips,
        int? version = null,
        (int Id, int Quantity)[]? sales = null)
        => await Read(await client.PutAsJsonAsync($"/shifter/v1/days/{Date}", new
        {
            shifts = shifts.Select(id => new { shift_id = id, worked = true }).ToArray(),
            sales = (sales ?? []).Select(sale => new { sales_id = sale.Id, quantity = sale.Quantity }).ToArray(),
            tips,
            tips_cash = (decimal?)null,
            deductions = 0m,
            deduction_reason = (string?)null,
            note = (string?)null,
            version,
        }));

    private static int Version(JsonElement day) => day.GetProperty("version").GetInt32();

    /// <summary>Every goal of the three periods, set low enough that one worked day crosses them all.</summary>
    private static async Task GoalsAsync(HttpClient client, decimal amount)
    {
        foreach (var period in new[] { "day", "week", "month" })
        {
            (await client.PutAsJsonAsync("/shifter/v1/goals", new
            {
                period,
                amount,
                anchor = (DateOnly?)null,
                note = (string?)null,
            })).EnsureSuccessStatusCode();
        }
    }

    private static async Task<int> CheersAsync(HttpClient client)
        => (await Read(await client.GetAsync("/shifter/v1/goals/history")))
            .GetProperty("cheers").GetArrayLength();

    [Fact]
    public async Task A_crossed_goal_cheers_once_through_the_worker_and_the_save_never_waits_for_it()
    {
        var phone = new HeldPush();

        await using var host = api.WithWebHostBuilder(builder => builder.ConfigureTestServices(
            services => services.AddScoped<IPushNotifier>(_ => phone)));

        var (client, _) = await api.SignInAsync("cheer", host);
        var shift = await TemplateAsync(client);

        await GoalsAsync(client, 500m);

        // Eight hours at a hundred crosses all three. The phone is being held,
        // so a save that waited for its cheer would never come back from here.
        var saved = await SaveAsync(client, [shift], 100m)
            .WaitAsync(TimeSpan.FromSeconds(20), TestContext.Current.CancellationToken);

        // The worker got there on its own, nobody called it.
        var deadline = DateTime.UtcNow.AddSeconds(20);

        while (phone.Asked == 0 && DateTime.UtcNow < deadline)
            await Task.Delay(10, TestContext.Current.CancellationToken);

        Assert.Equal(1, phone.Asked);

        // Saves piling up behind a check still running: nobody gets two cheers
        // out of them, however they fall.
        for (var again = 0; again < 3; again += 1)
            saved = await SaveAsync(client, [shift], 110m + again, Version(saved));

        Assert.Equal(1, phone.Asked);

        phone.Release();

        await api.GoalChecksAsync(host.Services);

        Assert.Equal(3, phone.Asked);
        Assert.Equal(3, await CheersAsync(client));

        // Long after, the line is still crossed and nothing is left to say.
        await SaveAsync(client, [shift], 200m, Version(saved));
        await api.GoalChecksAsync(host.Services);

        Assert.Equal(3, phone.Asked);
        Assert.Equal(3, await CheersAsync(client));
    }

    [Fact]
    public async Task A_save_answers_with_what_the_calendar_then_shows()
    {
        var (client, _) = await api.SignInAsync("sameanswer");
        var place = await PlaceAsync(client);
        var other = await PlaceAsync(client);
        var wine = await PositionAsync(client, "Вино", 300m);

        // Two places on one day, tips and sales split across them, each with
        // its tip-out and meal, and one paying under the place's floor: every
        // figure a day answers with that needs the place's rules to work out.
        var saved = await SaveAsync(
            client,
            [await TemplateAsync(client, place, 100m), await TemplateAsync(client, other, 900m)],
            1_000m,
            sales: [(wine, 4)]);

        var range = await Read(await client.GetAsync(
            $"/shifter/v1/days?from={Date}&to={Date}"));

        var shown = range.GetProperty("days")[0];

        Assert.True(saved.GetProperty("tip_out").GetDecimal() > 0m);
        Assert.True(saved.GetProperty("deductions").GetDecimal() > 0m);
        Assert.True(saved.GetProperty("below_floor").GetBoolean());
        Assert.True(
            JsonElement.DeepEquals(saved, shown),
            $"saved {saved.GetRawText()}\ncalendar {shown.GetRawText()}");

        // A day with nothing left on it has no places to ask about.
        var emptied = await SaveAsync(client, [], 50m, Version(saved));

        Assert.Equal(0m, emptied.GetProperty("tip_out").GetDecimal());
        Assert.Equal(50m, emptied.GetProperty("earned").GetDecimal());
    }

    [Fact]
    public async Task Sales_on_a_day_are_corrected_where_they_stand()
    {
        var (client, _) = await api.SignInAsync("salesstay");
        var shift = await TemplateAsync(client);
        var wine = await PositionAsync(client, "Вино", 300m);
        var cake = await PositionAsync(client, "Десерт", 200m);
        var coffee = await PositionAsync(client, "Кофе", 100m);

        async Task<Dictionary<int, (int Id, int Quantity, decimal Price)>> RowsAsync()
        {
            using var scope = api.Services.CreateScope();

            var db = scope.ServiceProvider.GetRequiredService<ShifterDbContext>();
            var ids = new[] { wine, cake, coffee };

            return await db.DaySales
                .AsNoTracking()
                .Where(row => ids.Contains(row.SalesId))
                .ToDictionaryAsync(
                    row => row.SalesId,
                    row => (row.Id, row.Quantity, row.UnitPrice),
                    TestContext.Current.CancellationToken);
        }

        var saved = await SaveAsync(client, [shift], 100m, sales: [(wine, 2), (cake, 3)]);
        var before = await RowsAsync();

        // Only the tips moved, so nothing about the sales gets written.
        saved = await SaveAsync(client, [shift], 110m, Version(saved), [(wine, 2), (cake, 3)]);

        Assert.Equal(before, await RowsAsync());
        Assert.Equal("Вино", saved.GetProperty("sales")[0].GetProperty("name").GetString());
        Assert.Equal(60m, saved.GetProperty("sales")[0].GetProperty("earned").GetDecimal());

        // A quantity changes in place, a line taken off goes and a new one arrives.
        saved = await SaveAsync(client, [shift], 110m, Version(saved), [(coffee, 1), (wine, 5)]);

        var after = await RowsAsync();

        Assert.Equal(before[wine].Id, after[wine].Id);
        Assert.Equal(5, after[wine].Quantity);
        Assert.False(after.ContainsKey(cake));
        Assert.Equal(1, after[coffee].Quantity);
        Assert.Equal(
            ["Кофе", "Вино"],
            saved.GetProperty("sales").EnumerateArray().Select(sale => sale.GetProperty("name").GetString()));

        // This line used to pin the opposite, that each save takes the catalogue
        // as it stands. That let a note fixed on an old day reprice it, against
        // the snapshot DaySale exists to keep.
        await Read(await client.PutAsJsonAsync(
            $"/shifter/v1/sales/{wine}", new { name = "Вино", price = 350m, percentage = 20m }));

        var noted = await SaveAsync(client, [shift], 110m, Version(saved), [(coffee, 1), (wine, 5)]);

        Assert.Equal(300m, (await RowsAsync())[wine].Price);

        // Five at the old 300 and the old 10%, whatever the catalogue says now.
        Assert.Equal(
            150m,
            noted.GetProperty("sales").EnumerateArray()
                .Single(sale => sale.GetProperty("name").GetString() == "Вино")
                .GetProperty("earned").GetDecimal());

        // A line put on from here on sells at the new price.
        await SaveAsync(client, [shift], 110m, Version(saved) + 1, [(coffee, 1)]);
        await SaveAsync(client, [shift], 110m, Version(saved) + 2, [(coffee, 1), (wine, 1)]);

        Assert.Equal(350m, (await RowsAsync())[wine].Price);
    }

    [Fact]
    public async Task A_delivery_corrects_a_count_and_leaves_the_price_it_was_sold_at()
    {
        var (client, login) = await api.SignInAsync("salesdelivery");
        var shift = await TemplateAsync(client);
        var wine = await PositionAsync(client, "Вино", 300m);

        await SaveAsync(client, [shift], 100m, sales: [(wine, 2)]);

        await Read(await client.PutAsJsonAsync(
            $"/shifter/v1/sales/{wine}", new { name = "Вино", price = 350m, percentage = 20m }));

        using var scope = api.Services.CreateScope();

        var db = scope.ServiceProvider.GetRequiredService<ShifterDbContext>();
        var ct = TestContext.Current.CancellationToken;
        var user = await db.Users.Where(row => row.Login == login).Select(row => row.Id).SingleAsync(ct);

        // The till resending the day: the handler prices each line off the
        // catalogue as it stands, so the new figures are what arrives here.
        await scope.ServiceProvider.GetRequiredService<IShifterCommand>().MergeDaySalesAsync(
            user,
            new DaySalesMerge(
                DateOnly.Parse(Date),
                [new DaySale { SalesId = wine, Quantity = 5, UnitPrice = 350m, Percentage = 20m }],
                Replace: false,
                Tips: null,
                TipsCash: null,
                Deductions: null,
                Note: null),
            ct);

        var range = await Read(await client.GetAsync($"/shifter/v1/days?from={Date}&to={Date}"));
        var sale = range.GetProperty("days")[0].GetProperty("sales")[0];

        Assert.Equal(5, sale.GetProperty("quantity").GetInt32());
        Assert.Equal(150m, sale.GetProperty("earned").GetDecimal());
    }

    [Fact]
    public async Task A_delivered_count_moves_the_version_and_the_same_count_again_does_not()
    {
        var (client, login) = await api.SignInAsync("salesversion");
        var shift = await TemplateAsync(client);
        var wine = await PositionAsync(client, "Вино", 300m);

        await SaveAsync(client, [shift], 100m, sales: [(wine, 2)]);

        using var scope = api.Services.CreateScope();

        var db = scope.ServiceProvider.GetRequiredService<ShifterDbContext>();
        var ct = TestContext.Current.CancellationToken;
        var user = await db.Users.Where(row => row.Login == login).Select(row => row.Id).SingleAsync(ct);

        async Task<int> DeliverAsync(int quantity, bool replace)
        {
            using var delivery = api.Services.CreateScope();

            await delivery.ServiceProvider.GetRequiredService<IShifterCommand>().MergeDaySalesAsync(
                user,
                new DaySalesMerge(
                    DateOnly.Parse(Date),
                    quantity > 0
                        ? [new DaySale { SalesId = wine, Quantity = quantity, UnitPrice = 300m, Percentage = 20m }]
                        : [],
                    replace,
                    Tips: null,
                    TipsCash: null,
                    Deductions: null,
                    Note: null),
                ct);

            var range = await Read(await client.GetAsync($"/shifter/v1/days?from={Date}&to={Date}"));

            return range.GetProperty("days")[0].GetProperty("version").GetInt32();
        }

        int counted = await DeliverAsync(5, replace: false);

        Assert.Equal(counted, await DeliverAsync(5, replace: false));

        // A till resending the day without the line: voided, and a change like any other.
        Assert.Equal(counted + 1, await DeliverAsync(0, replace: true));
    }
}
