using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text;
using System.Text.Json;

using Xunit;

namespace Shifter.Api.Tests;

/// <summary>
/// A year carried in from another tracker, and what happens to the months
/// already here.
///
/// The promise is that days somebody already has are left alone. Somebody
/// importing a year on top of three months of real work must not lose the
/// three months, and nothing had checked that beyond me watching it once.
/// </summary>
[Collection("api")]
public sealed class ImportOverHttpTests(Api api)
{
    private static async Task<JsonElement> Read(HttpResponseMessage response)
    {
        var body = await response.Content.ReadAsStringAsync();

        Assert.True(
            response.IsSuccessStatusCode,
            $"{(int)response.StatusCode} {response.RequestMessage?.RequestUri}: {body}");

        return JsonDocument.Parse(body).RootElement.Clone();
    }

    private static MultipartFormDataContent File(string csv, params (string, string)[] fields)
    {
        var form = new MultipartFormDataContent();
        var file = new ByteArrayContent(Encoding.UTF8.GetBytes(csv));

        file.Headers.ContentType = new MediaTypeHeaderValue("text/csv");
        form.Add(file, "file", "history.csv");

        foreach (var (name, value) in fields) form.Add(new StringContent(value), name);

        return form;
    }

    /// <summary>
    /// The shape a foreign export actually arrives in: semicolons because the
    /// machine was Russian-locale, a quoted venue with a comma in it, a
    /// space-and-comma decimal, and one row whose date cannot be read.
    /// </summary>
    private const string Foreign =
        "Дата;Часы;Сумма чаевых;Сумма;Заведение;Заметка\r\n"
        + "01.03.2019;8;200;800;\"Bar, The\";обычный день\r\n"
        + "02.03.2019;12;450;1 200,50;Bar, The;\r\n"
        + "вчера;5;0;300;Kitchen;битая строка\r\n";

    private const string Mapping =
        """{"date":0,"hours":1,"earned":3,"tips":2,"place":4,"note":5}""";

    [Fact]
    public async Task It_reads_the_file_before_writing_anything()
    {
        var (client, _) = await api.SignInAsync("preview");

        var preview = await Read(await client.PostAsync(
            "/shifter/v1/import/csv/preview", File(Foreign)));

        // The separator was found despite a comma inside a quoted venue name,
        // and "Сумма чаевых" went to the tips rather than to the wage — they
        // share a word, and only one reading is ever right.
        var mapping = preview.GetProperty("mapping");

        Assert.Equal(0, mapping.GetProperty("date").GetInt32());
        Assert.Equal(2, mapping.GetProperty("tips").GetInt32());
        Assert.Equal(3, mapping.GetProperty("earned").GetInt32());

        Assert.Contains(
            "undated:1",
            preview.GetProperty("problems").EnumerateArray().Select(one => one.GetString()));

        // Nothing was saved by looking.
        var range = await Read(await client.GetAsync(
            "/shifter/v1/days?from=2019-03-01&to=2019-03-31"));

        Assert.Equal(0m, range.GetProperty("total_earned").GetDecimal());
    }

    [Fact]
    public async Task It_writes_the_rows_it_could_read_and_says_what_it_skipped()
    {
        var (client, _) = await api.SignInAsync("import");

        var written = await Read(await client.PostAsync(
            "/shifter/v1/import/csv",
            File(Foreign, ("mapping", Mapping), ("start", "18:00"))));

        Assert.Equal(2, written.GetProperty("days").GetInt32());
        Assert.Equal(1, written.GetProperty("skipped").GetInt32());

        var range = await Read(await client.GetAsync(
            "/shifter/v1/days?from=2019-03-01&to=2019-03-31"));

        // 800 + 200 tips, and 1 200,50 + 450 — the space in the thousands and
        // the comma in the decimal both read the way the exporting machine
        // meant them.
        Assert.Equal(1_000m + 1_650.50m, range.GetProperty("total_earned").GetDecimal());
    }

    [Fact]
    public async Task A_day_that_is_already_there_survives_the_import()
    {
        // Somebody importing a year on top of three months of real work must
        // not lose the three months.
        var (client, _) = await api.SignInAsync("keep");

        var shift = await Read(await client.PostAsJsonAsync(
            "/shifter/v1/shifts",
            new
            {
                name = "Своя смена",
                symbol = (string?)null,
                location_id = (int?)null,
                start_time = "10:00",
                end_time = "18:00",
                salary_period = "hour",
                salary_amount = 500m,
                break_minutes = 0,
            }));

        (await client.PutAsJsonAsync("/shifter/v1/days/2019-03-01", new
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
            tips = (decimal?)null,
            tips_cash = (decimal?)null,
            deductions = 0m,
            deduction_reason = (string?)null,
            note = "мой день",
        })).EnsureSuccessStatusCode();

        var written = await Read(await client.PostAsync(
            "/shifter/v1/import/csv",
            File(Foreign, ("mapping", Mapping), ("start", "18:00"))));

        // The first of March was already there, so one row landed and two were
        // left where they were.
        Assert.Equal(1, written.GetProperty("days").GetInt32());
        Assert.Equal(2, written.GetProperty("skipped").GetInt32());

        var day = (await Read(await client.GetAsync(
            "/shifter/v1/days?from=2019-03-01&to=2019-03-01")))
            .GetProperty("days").EnumerateArray().Single();

        Assert.Equal("мой день", day.GetProperty("note").GetString());
        Assert.Equal(4_000m, day.GetProperty("earned").GetDecimal());
    }

    [Fact]
    public async Task A_file_with_no_date_column_named_is_refused()
    {
        var (client, _) = await api.SignInAsync("nodate");

        var refused = await client.PostAsync(
            "/shifter/v1/import/csv",
            File(Foreign, ("mapping", """{"date":-1}"""), ("start", "18:00")));

        Assert.Equal(System.Net.HttpStatusCode.BadRequest, refused.StatusCode);
    }
}
