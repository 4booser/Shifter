using System.Text.Json;
using Shifter.Application.Common.Exceptions;
using Shifter.Application.Features.Webhooks.DTOs;
using Shifter.Application.Features.Webhooks.Services;

using Xunit;

namespace Shifter.Tests;

/// <summary>
/// Reading a stranger's payload. Everything here is about the gap between what
/// a till emits and what the calendar means: envelopes to see past, cents to
/// divide, dates written six different ways, and fields the sender simply does
/// not have.
/// </summary>
public class WebhookMappingTests
{
    private static JsonElement Body(string json)
        => JsonDocument.Parse(json).RootElement.Clone();

    private static SalesPayload Sales(string json, string? mapping = null)
        => PayloadReader.ReadSales(Body(json), PayloadMapping.Parse(mapping));

    private static HoursPayload Hours(string json, string? mapping = null)
        => PayloadReader.ReadHours(Body(json), PayloadMapping.Parse(mapping));

    // ==== The canonical shape ====

    [Fact]
    public void Reads_a_canonical_payload_without_any_mapping()
    {
        SalesPayload payload = Sales("""
            {
              "date": "2026-08-20",
              "external_id": "till-88",
              "tips": 42.5,
              "tips_cash": 10,
              "note": "busy",
              "sales": [{ "name": "Wine", "quantity": 3 }]
            }
            """);

        Assert.Equal(new DateOnly(2026, 8, 20), payload.Date);
        Assert.Equal("till-88", payload.ExternalId);
        Assert.Equal(42.5m, payload.Tips);
        Assert.Equal(10m, payload.TipsCash);
        Assert.Equal("busy", payload.Note);
        Assert.False(payload.Replace);

        SalesLine line = Assert.Single(payload.Lines);

        Assert.Equal("Wine", line.Name);
        Assert.Equal(3, line.Quantity);
    }

    /// <summary>
    /// A partial delivery has to stay partial all the way through: null here is
    /// what stops a payload of tips from erasing the note under it.
    /// </summary>
    [Fact]
    public void Leaves_fields_the_payload_never_mentioned_as_null()
    {
        SalesPayload payload = Sales("""{ "date": "2026-08-20", "tips": 12 }""");

        Assert.Null(payload.TipsCash);
        Assert.Null(payload.Deductions);
        Assert.Null(payload.Note);
        Assert.Empty(payload.Lines);
    }

    // ==== A provider's own shape ====

    [Fact]
    public void Reads_a_provider_payload_through_its_mapping()
    {
        const string mapping = """
            {
              "$root": "data.object",
              "date": "closed_at",
              "external_id": "id",
              "tips": "totals.tip_money",
              "sales": "line_items",
              "sales.name": "catalogue.name",
              "sales.quantity": "qty",
              "$divide": { "tips": 100 }
            }
            """;

        SalesPayload payload = Sales("""
            {
              "type": "order.closed",
              "data": {
                "object": {
                  "id": "sq-991",
                  "closed_at": "2026-08-20T23:40:00+02:00",
                  "totals": { "tip_money": 4250 },
                  "line_items": [
                    { "catalogue": { "name": "Wine" }, "qty": 3 },
                    { "catalogue": { "name": "Coffee" }, "qty": 11 }
                  ]
                }
              }
            }
            """, mapping);

        Assert.Equal(new DateOnly(2026, 8, 20), payload.Date);
        Assert.Equal("sq-991", payload.ExternalId);
        Assert.Equal(42.50m, payload.Tips);
        Assert.Equal(["Wine", "Coffee"], payload.Lines.Select(line => line.Name));
        Assert.Equal([3, 11], payload.Lines.Select(line => line.Quantity));
    }

    /// <summary>
    /// For the fields a sender never has. Without it, an endpoint whose till
    /// only ever reports one shift could not say which one.
    /// </summary>
    [Fact]
    public void Takes_a_literal_for_a_field_the_sender_does_not_send()
    {
        HoursPayload payload = Hours(
            """{ "day": "2026-08-20", "worked_hours": 6.5 }""",
            """{ "date": "day", "hours": "worked_hours", "shift": "=Evening", "worked": "=true" }""");

        Assert.Equal("Evening", payload.Shift);
        Assert.Equal(6.5, payload.Hours);
        Assert.True(payload.Worked);
    }

    [Fact]
    public void Reads_an_array_element_by_index()
    {
        SalesPayload payload = Sales(
            """{ "events": [{ "when": "2026-08-20", "tip": 5 }] }""",
            """{ "date": "events[0].when", "tips": "events[0].tip" }""");

        Assert.Equal(new DateOnly(2026, 8, 20), payload.Date);
        Assert.Equal(5m, payload.Tips);
    }

    [Fact]
    public void Refuses_a_root_the_payload_does_not_have()
    {
        ValidationException error = Assert.Throws<ValidationException>(
            () => Sales("""{ "date": "2026-08-20" }""", """{ "$root": "data.object" }"""));

        Assert.Contains("$root", error.Message);
    }

    [Fact]
    public void Refuses_a_mapping_that_is_not_readable()
    {
        Assert.Throws<ValidationException>(() => PayloadMapping.Parse("{ not json"));
        Assert.Throws<ValidationException>(() => PayloadMapping.Parse("[1, 2]"));
        Assert.Throws<ValidationException>(() => PayloadMapping.Parse("""{ "tips": 12 }"""));
    }

    // ==== Dates, times and numbers as senders actually write them ====

    [Theory]
    [InlineData("\"2026-08-20\"")]
    [InlineData("\"2026-08-20T18:00:00Z\"")]
    [InlineData("1787248800")]
    [InlineData("1787248800000")]
    public void Reads_a_date_in_the_shapes_senders_use(string value)
    {
        SalesPayload payload = Sales($$"""{ "date": {{value}} }""");

        Assert.Equal(new DateOnly(2026, 8, 20), payload.Date);
    }

    /// <summary>
    /// A till closing after midnight files the night under the date on its own
    /// wall clock. Converting to UTC first would move a whole evening's takings
    /// onto the day before.
    /// </summary>
    [Fact]
    public void Keeps_the_senders_own_day_when_the_timestamp_carries_an_offset()
    {
        SalesPayload payload = Sales("""{ "date": "2026-08-21T00:30:00+02:00" }""");

        Assert.Equal(new DateOnly(2026, 8, 21), payload.Date);
    }

    [Fact]
    public void Refuses_a_payload_with_no_date_at_all()
    {
        ValidationException error = Assert.Throws<ValidationException>(
            () => Sales("""{ "tips": 10 }"""));

        Assert.Contains("date", error.Message);
    }

    [Fact]
    public void Refuses_a_date_it_cannot_read()
    {
        Assert.Throws<ValidationException>(() => Sales("""{ "date": "last tuesday" }"""));
    }

    [Fact]
    public void Reads_numbers_that_arrived_as_strings()
    {
        SalesPayload payload = Sales("""
            { "date": "2026-08-20", "tips": "42.50", "sales": [{ "name": "Wine", "quantity": "3" }] }
            """);

        Assert.Equal(42.50m, payload.Tips);
        Assert.Equal(3, payload.Lines[0].Quantity);
    }

    [Theory]
    [InlineData("true", true)]
    [InlineData("\"yes\"", true)]
    [InlineData("1", true)]
    [InlineData("\"planned\"", false)]
    [InlineData("false", false)]
    public void Reads_yes_and_no_in_the_shapes_senders_write_them(string value, bool expected)
    {
        HoursPayload payload = Hours($$"""{ "date": "2026-08-20", "worked": {{value}} }""");

        Assert.Equal(expected, payload.Worked);
    }

    /// <summary>
    /// Unrecognised is not "no". A timesheet whose flag says "OK" should be
    /// read as worked, which is the default, rather than filed as a plan.
    /// </summary>
    [Fact]
    public void Falls_back_to_worked_when_the_flag_says_something_unfamiliar()
    {
        Assert.True(Hours("""{ "date": "2026-08-20", "worked": "OK" }""").Worked);
    }

    [Fact]
    public void Refuses_a_position_with_no_quantity_and_a_quantity_below_zero()
    {
        Assert.Throws<ValidationException>(() => Sales("""
            { "date": "2026-08-20", "sales": [{ "name": "Wine" }] }
            """));

        Assert.Throws<ValidationException>(() => Sales("""
            { "date": "2026-08-20", "sales": [{ "name": "Wine", "quantity": -2 }] }
            """));
    }

    [Fact]
    public void Refuses_a_position_that_names_nothing()
    {
        Assert.Throws<ValidationException>(() => Sales("""
            { "date": "2026-08-20", "sales": [{ "quantity": 2 }] }
            """));
    }

    [Fact]
    public void Refuses_a_sales_field_that_is_not_a_list()
    {
        Assert.Throws<ValidationException>(() => Sales("""
            { "date": "2026-08-20", "sales": { "name": "Wine" } }
            """));
    }

    /// <summary>
    /// A daily summary written by a person, rather than exported by a till:
    /// the positions are a plain map of name to how many. Refusing it would
    /// mean asking them to rewrite their report to suit us.
    /// </summary>
    [Fact]
    public void Reads_positions_given_as_a_map_of_name_to_quantity()
    {
        SalesPayload payload = Sales("""
            {
              "date": "2026-08-24",
              "sales": { "Heven": 2, "Maduro": "3", "Adalya": 1 }
            }
            """);

        Assert.Equal(["Heven", "Maduro", "Adalya"], payload.Lines.Select(line => line.Name));
        Assert.Equal([2, 3, 1], payload.Lines.Select(line => line.Quantity));
    }

    [Fact]
    public void Reads_a_map_whose_values_are_objects()
    {
        SalesPayload payload = Sales(
            """{ "day": "2026-08-24", "items": { "Heven": { "qty": 4 } } }""",
            """{ "date": "day", "sales": "items", "sales.quantity": "qty" }""");

        SalesLine line = Assert.Single(payload.Lines);

        Assert.Equal("Heven", line.Name);
        Assert.Equal(4, line.Quantity);
    }

    /// <summary>The key names the position; a name inside the element was
    /// written on purpose and wins over it.</summary>
    [Fact]
    public void Prefers_a_name_the_element_carries_over_the_key_it_sits_under()
    {
        SalesPayload payload = Sales("""
            { "date": "2026-08-24", "sales": { "sku-11": { "name": "Heven", "quantity": 2 } } }
            """);

        Assert.Equal("Heven", Assert.Single(payload.Lines).Name);
    }

    // ==== Hours ====

    [Fact]
    public void Reads_clock_times_and_a_break()
    {
        HoursPayload payload = Hours("""
            {
              "date": "2026-08-20",
              "shift": "Evening",
              "start": "17:00",
              "end": "2026-08-20T23:30:00",
              "break_minutes": 30
            }
            """);

        Assert.Equal(new TimeOnly(17, 0), payload.Start);
        Assert.Equal(new TimeOnly(23, 30), payload.End);
        Assert.Equal(30, payload.BreakMinutes);
    }

    [Fact]
    public void Refuses_a_time_it_cannot_read()
    {
        Assert.Throws<ValidationException>(() => Hours("""
            { "date": "2026-08-20", "start": "the evening" }
            """));
    }
}
