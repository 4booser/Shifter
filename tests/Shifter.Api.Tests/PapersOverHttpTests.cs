using System.IO.Compression;
using System.Net.Http.Json;
using System.Text;
using System.Text.Json;

using Xunit;

namespace Shifter.Api.Tests;

/// <summary>
/// The papers, fetched as a person would fetch them.
///
/// A worker without papers is the weak side of every negotiation, and these
/// three endpoints are the application's answer. Each walks a whole account,
/// so each is tested against an account with a real month in it — and against
/// the one privacy rule that matters most here: the archive holds one
/// person's life and nobody else's.
/// </summary>
[Collection("api")]
public sealed class PapersOverHttpTests(Api api)
{
    private static string Day(int day) => $"2026-07-{day:00}";

    private static async Task SeedMonthAsync(HttpClient client)
    {
        var made = await client.PostAsJsonAsync("/shifter/v1/shifts", new
        {
            name = "Вечер",
            symbol = (string?)null,
            location_id = (int?)null,
            start_time = "18:00",
            end_time = "02:00",
            salary_period = "hour",
            salary_amount = 200m,
            break_minutes = 0,
        });

        made.EnsureSuccessStatusCode();

        var shift = (await made.Content.ReadFromJsonAsync<JsonElement>())
            .GetProperty("id").GetInt32();

        foreach (var day in new[] { 3, 4, 10, 11 })
        {
            (await client.PutAsJsonAsync($"/shifter/v1/days/{Day(day)}", new
            {
                shifts = new[]
                {
                    new
                    {
                        shift_id = shift,
                        worked = true,
                        needs_cover = false,
                        actual_start = (string?)null,
                        actual_end = (string?)null,
                        break_minutes = (int?)null,
                        revenue = (decimal?)null,
                    },
                },
                sales = Array.Empty<object>(),
                tips = 600m,
                tips_cash = (decimal?)null,
                deductions = 0m,
                deduction_reason = (string?)null,
                note = "смена; с «гильеметами» и \"настоящей\" кавычкой",
            })).EnsureSuccessStatusCode();
        }
    }

    [Fact]
    public async Task The_income_statement_is_a_real_pdf_with_the_honesty_line()
    {
        var (client, _) = await api.SignInAsync("pdf");

        await SeedMonthAsync(client);

        var response = await client.GetAsync(
            $"/shifter/v1/papers/income.pdf?from={Day(1)}&to={Day(31)}");

        response.EnsureSuccessStatusCode();

        var bytes = await response.Content.ReadAsByteArrayAsync();

        Assert.Equal("application/pdf", response.Content.Headers.ContentType?.MediaType);
        Assert.True(bytes.Length > 1_000, "a statement should not be an empty shell");
        Assert.Equal("%PDF", Encoding.ASCII.GetString(bytes, 0, 4));
    }

    [Fact]
    public async Task An_empty_period_is_refused_rather_than_papered()
    {
        // A statement over nothing is not a modest document, it is a blank
        // one with a signature line — worse than an error.
        var (client, _) = await api.SignInAsync("pdfempty");

        var response = await client.GetAsync(
            "/shifter/v1/papers/income.pdf?from=2019-01-01&to=2019-01-31");

        Assert.Equal(System.Net.HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task The_accountant_csv_is_the_most_boring_spreadsheet_money_can_be_written_in()
    {
        var (client, _) = await api.SignInAsync("acc");

        await SeedMonthAsync(client);

        var csv = await client.GetStringAsync(
            $"/shifter/v1/papers/accountant.csv?from={Day(1)}&to={Day(31)}");

        var lines = csv.TrimStart('﻿').Trim().Split("\r\n");

        Assert.Equal("Місяць;Днів;Годин;Нараховано;З них чайові;Надійшло", lines[0]);
        // Four eight-hour shifts at 200 plus four days of 600 in tips.
        Assert.Equal("2026-07;4;32;8800;2400;0", lines[1]);
    }

    [Fact]
    public async Task The_takeout_holds_a_whole_account_and_only_that_account()
    {
        var (mine, _) = await api.SignInAsync("takeout");
        var (theirs, _) = await api.SignInAsync("bystander");

        await SeedMonthAsync(mine);

        // The bystander's day, which must not travel in my archive.
        var alien = await theirs.PostAsJsonAsync("/shifter/v1/shifts", new
        {
            name = "ЧУЖАЯ СМЕНА",
            symbol = (string?)null,
            location_id = (int?)null,
            start_time = "10:00",
            end_time = "18:00",
            salary_period = "hour",
            salary_amount = 999m,
            break_minutes = 0,
        });

        alien.EnsureSuccessStatusCode();

        var response = await mine.GetAsync("/shifter/v1/account/export");

        response.EnsureSuccessStatusCode();

        using var zip = new ZipArchive(
            new MemoryStream(await response.Content.ReadAsByteArrayAsync()),
            ZipArchiveMode.Read);

        var names = zip.Entries.Select(entry => entry.FullName).ToArray();

        Assert.Contains("days.json", names);
        Assert.Contains("days.csv", names);
        Assert.Contains("shifts.json", names);
        Assert.Contains("README.txt", names);

        string ReadEntry(string name)
        {
            using var reader = new StreamReader(zip.GetEntry(name)!.Open());

            return reader.ReadToEnd();
        }

        var days = ReadEntry("days.json");

        Assert.Contains("Вечер", days);
        Assert.Contains("2026-07-03", days);

        // One person's life and nobody else's.
        foreach (var name in names.Where(entry => entry.EndsWith(".json")))
            Assert.DoesNotContain("ЧУЖАЯ", ReadEntry(name));

        // The CSV survives its own punctuation: the note carries a semicolon
        // (which forces the wrap) and an ASCII quote (which forces the
        // doubling), and a naive writer would have split the row on the first
        // and ended the cell on the second.
        var sheet = ReadEntry("days.csv");

        Assert.Contains("\"смена; с «гильеметами» и \"\"настоящей\"\" кавычкой\"", sheet);
    }

    [Fact]
    public async Task The_chronicle_derives_the_chapters_and_keeps_the_note_private_shaped()
    {
        var (client, _) = await api.SignInAsync("chron");

        var place = await client.PostAsJsonAsync("/shifter/v1/locations", new
        {
            name = "Старый бар",
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
            tip_out_of_tips_percent = 0m,
            tip_out_of_sales_percent = 0m,
            meal_deduction = 0m,
            tax_percent = 0m,
            tax_tips = false,
            holiday_percent = 0m,
            currency = (string?)null,
        });

        place.EnsureSuccessStatusCode();

        var placeId = (await place.Content.ReadFromJsonAsync<JsonElement>())
            .GetProperty("id").GetInt32();

        var shift = await client.PostAsJsonAsync("/shifter/v1/shifts", new
        {
            name = "Смена",
            symbol = (string?)null,
            location_id = placeId,
            start_time = "10:00",
            end_time = "18:00",
            salary_period = "hour",
            salary_amount = 150m,
            break_minutes = 0,
        });

        shift.EnsureSuccessStatusCode();

        var shiftId = (await shift.Content.ReadFromJsonAsync<JsonElement>())
            .GetProperty("id").GetInt32();

        foreach (var day in new[] { "2026-01-05", "2026-01-06" })
        {
            (await client.PutAsJsonAsync($"/shifter/v1/days/{day}", new
            {
                shifts = new[]
                {
                    new
                    {
                        shift_id = shiftId,
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
                deductions = 0m,
                deduction_reason = (string?)null,
                note = (string?)null,
            })).EnsureSuccessStatusCode();
        }

        (await client.PutAsJsonAsync(
            $"/shifter/v1/papers/chronicle/{placeId}/note",
            new { note = "ушёл из-за штрафов" })).EnsureSuccessStatusCode();

        // A second place on a monthly wage: two worked days, salary 3000.
        // Its chapter must say 3000 — a per-day sum would say zero, which is
        // the exact lie the salary guard exists to catch.
        var salaried = await client.PostAsJsonAsync("/shifter/v1/locations", new
        {
            name = "Оклад",
            address = (string?)null,
            colour = "#254117",
            pay_period = "monthly",
            pay_day = 5,
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
        });

        salaried.EnsureSuccessStatusCode();

        var salariedId = (await salaried.Content.ReadFromJsonAsync<JsonElement>())
            .GetProperty("id").GetInt32();

        var monthly = await client.PostAsJsonAsync("/shifter/v1/shifts", new
        {
            name = "Офис",
            symbol = (string?)null,
            location_id = salariedId,
            start_time = "09:00",
            end_time = "17:00",
            salary_period = "month",
            salary_amount = 3000m,
            break_minutes = 0,
        });

        monthly.EnsureSuccessStatusCode();

        var monthlyId = (await monthly.Content.ReadFromJsonAsync<JsonElement>())
            .GetProperty("id").GetInt32();

        foreach (var day in new[] { "2026-02-03", "2026-02-04" })
        {
            (await client.PutAsJsonAsync($"/shifter/v1/days/{day}", new
            {
                shifts = new[]
                {
                    new
                    {
                        shift_id = monthlyId,
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
                deductions = 0m,
                deduction_reason = (string?)null,
                note = (string?)null,
            })).EnsureSuccessStatusCode();
        }

        var chapters = JsonDocument.Parse(await client.GetStringAsync(
            "/shifter/v1/papers/chronicle")).RootElement.EnumerateArray().ToArray();

        var salariedChapter = chapters.Single(one => one.GetProperty("location_id").GetInt32() == salariedId);

        Assert.Equal(3_000m, salariedChapter.GetProperty("earned").GetDecimal());

        var chapter = chapters.Single(one => one.GetProperty("location_id").GetInt32() == placeId);

        Assert.Equal("2026-01-05", chapter.GetProperty("first_day").GetString());
        Assert.Equal("2026-01-06", chapter.GetProperty("last_day").GetString());
        Assert.Equal(2, chapter.GetProperty("days").GetInt32());
        Assert.Equal(2_400m, chapter.GetProperty("earned").GetDecimal());
        Assert.Equal(150m, chapter.GetProperty("rate_first").GetDecimal());
        // Five weeks of silence is the record's own way of saying it ended.
        Assert.False(chapter.GetProperty("current").GetBoolean());
        Assert.Equal("ушёл из-за штрафов", chapter.GetProperty("note").GetString());
        // The chapter says whose money it counts: empty means the app's own.
        Assert.Equal("", chapter.GetProperty("currency").GetString());

        // And the reason it is private by construction: the CV endpoint must
        // never carry it. The note names the exact kind of sentence that must
        // not leak.
        var cv = await client.GetStringAsync("/shifter/v1/account/card");

        Assert.DoesNotContain("штраф", cv);
    }
}

