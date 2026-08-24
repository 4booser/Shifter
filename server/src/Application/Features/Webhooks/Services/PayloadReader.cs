using System.Globalization;
using System.Text.Json;
using Shifter.Application.Common.Exceptions;
using Shifter.Application.Features.Webhooks.DTOs;

namespace Shifter.Application.Features.Webhooks.Services;

/// <summary>
/// Turns a delivery's body into one of the canonical payloads, through the
/// endpoint's mapping.
///
/// Everything here is lenient about form and strict about meaning. Senders
/// write numbers as strings, dates as epochs, booleans as "Y"; refusing those
/// helps nobody, since the person on the receiving end cannot change what their
/// employer's till emits. What it will not do is guess at a missing date or an
/// unreadable quantity — that is how a night's takings land on the wrong day.
/// </summary>
public static class PayloadReader
{
    /// <summary>Lines past this in one delivery are a runaway sender, not a day.</summary>
    private const int MaxLines = 200;

    public static SalesPayload ReadSales(JsonElement body, PayloadMapping mapping)
    {
        JsonElement root = mapping.Root(body);

        SalesLine[]? lines = ReadLines(mapping, root);

        return new SalesPayload(
            RequireDate(mapping.Read(root, "date"), "date"),
            Text(mapping.Read(root, "external_id")),
            Money(mapping, root, "tips"),
            Money(mapping, root, "tips_cash"),
            Money(mapping, root, "deductions"),
            Text(mapping.Read(root, "note")),
            Flag(mapping.Read(root, "replace")) ?? false,
            lines ?? [],
            lines is not null);
    }

    public static HoursPayload ReadHours(JsonElement body, PayloadMapping mapping)
    {
        JsonElement root = mapping.Root(body);

        double? hours = null;

        if (mapping.Read(root, "hours") is JsonElement raw)
        {
            decimal value = Number(raw, "hours");

            hours = (double)mapping.Scale("hours", value);
        }

        int? breakMinutes = null;

        if (mapping.Read(root, "break_minutes") is JsonElement rest)
            breakMinutes = (int)Math.Round(Number(rest, "break_minutes"));

        TimeOnly? start = Clock(mapping.Read(root, "start"), "start");
        TimeOnly? end = Clock(mapping.Read(root, "end"), "end");

        return new HoursPayload(
            RequireDate(mapping.Read(root, "date"), "date"),
            Text(mapping.Read(root, "external_id")),
            Text(mapping.Read(root, "shift")),
            start,
            end,
            hours,
            breakMinutes,
            // A timesheet reports the past. Something still ahead has to say so.
            Flag(mapping.Read(root, "worked")) ?? true,
            hours is not null || start is not null || end is not null);
    }

    /// <summary>Null when the payload carries no positions field at all.</summary>
    private static SalesLine[]? ReadLines(PayloadMapping mapping, JsonElement root)
    {
        if (mapping.Read(root, "sales") is not JsonElement sold) return null;

        // Two shapes, because senders genuinely use both. A list of objects is
        // what a till exports. A plain map of name to quantity is what a daily
        // summary looks like when somebody wrote it by hand — and refusing that
        // would mean asking them to rewrite their report to suit us.
        (string? Key, JsonElement Value)[] items = sold.ValueKind switch
        {
            JsonValueKind.Array => sold
                .EnumerateArray()
                .Select(item => ((string?)null, item))
                .ToArray(),

            JsonValueKind.Object => sold
                .EnumerateObject()
                .Select(property => ((string?)property.Name, property.Value))
                .ToArray(),

            _ => throw new ValidationException(
                "'sales' must be a list of sold positions, or an object of name to quantity.")
        };

        if (items.Length > MaxLines)
            throw new ValidationException($"At most {MaxLines} positions in one delivery.");

        List<SalesLine> lines = [];

        foreach ((string? key, JsonElement item) in items)
        {
            // The bare form: "Heven": 2. The name is the key and the value is
            // the count, with nothing to read inside it.
            if (key is not null && item.ValueKind is not JsonValueKind.Object)
            {
                decimal counted = mapping.Scale("sales.quantity", Number(item, key));

                lines.Add(new SalesLine(null, key.Trim(), Quantity(counted)));

                continue;
            }

            // The paths inside an element are written as "sales.name" in the
            // mapping and fall back to the bare field name without it.
            int? id = null;

            if (mapping.Read(item, "sales.sales_id", "sales_id") is JsonElement number)
                id = (int)Math.Round(Number(number, "sales_id"));

            // A keyed object names the position by its key; anything the
            // element carries itself wins, since it was written on purpose.
            string? name = Text(mapping.Read(item, "sales.name", "name")) ?? key;

            if (id is null && string.IsNullOrWhiteSpace(name))
                throw new ValidationException("A sold position has neither a name nor an id.");

            JsonElement? quantity = mapping.Read(item, "sales.quantity", "quantity");

            if (quantity is null)
            {
                throw new ValidationException(
                    $"The position '{name ?? id?.ToString(CultureInfo.InvariantCulture)}' "
                    + "has no quantity.");
            }

            lines.Add(new SalesLine(
                id,
                name?.Trim(),
                Quantity(mapping.Scale("sales.quantity", Number(quantity.Value, "quantity")))));
        }

        return lines.ToArray();
    }

    private static int Quantity(decimal counted)
    {
        if (counted < 0)
            throw new ValidationException("A quantity cannot be negative.");

        return (int)Math.Round(counted);
    }

    /// <summary>An amount of money, scaled if the endpoint says the sender counts in cents.</summary>
    private static decimal? Money(PayloadMapping mapping, JsonElement root, string field)
    {
        if (mapping.Read(root, field) is not JsonElement value) return null;

        return mapping.Scale(field, Number(value, field));
    }

    private static decimal Number(JsonElement value, string field)
    {
        if (value.ValueKind == JsonValueKind.Number && value.TryGetDecimal(out decimal number))
            return number;

        // Numbers arrive quoted more often than not, and a value the sender
        // formatted with a comma is still a number to everyone but a parser.
        if (value.ValueKind == JsonValueKind.String)
        {
            string text = (value.GetString() ?? string.Empty).Trim().Replace(',', '.');

            if (decimal.TryParse(text, NumberStyles.Any, CultureInfo.InvariantCulture, out decimal parsed))
                return parsed;
        }

        throw new ValidationException($"'{field}' is not a number.");
    }

    private static string? Text(JsonElement? value)
    {
        if (value is not JsonElement element) return null;

        string? text = element.ValueKind switch
        {
            JsonValueKind.String => element.GetString(),
            JsonValueKind.Number => element.ToString(),
            JsonValueKind.True => "true",
            JsonValueKind.False => "false",
            _ => null
        };

        return string.IsNullOrWhiteSpace(text) ? null : text;
    }

    /// <summary>
    /// Yes and no in the shapes senders actually use. Anything unrecognised is
    /// left to the caller's default rather than read as false, which would turn
    /// a typo into a silent "not worked".
    /// </summary>
    private static bool? Flag(JsonElement? value)
    {
        if (value is not JsonElement element) return null;

        return element.ValueKind switch
        {
            JsonValueKind.True => true,
            JsonValueKind.False => false,
            JsonValueKind.Number => element.TryGetDecimal(out decimal number) && number != 0m,
            JsonValueKind.String => (element.GetString() ?? string.Empty).Trim().ToLowerInvariant() switch
            {
                "true" or "yes" or "y" or "1" or "worked" => true,
                "false" or "no" or "n" or "0" or "planned" => false,
                _ => null
            },
            _ => null
        };
    }

    private static DateOnly RequireDate(JsonElement? value, string field)
    {
        if (value is not JsonElement element)
            throw new ValidationException($"The payload has no '{field}'.");

        // An epoch, which is what half of the world's webhooks send. Anything
        // past the year 5138 in seconds is milliseconds instead.
        if (element.ValueKind == JsonValueKind.Number && element.TryGetInt64(out long epoch))
        {
            DateTimeOffset moment = epoch > 100_000_000_000L
                ? DateTimeOffset.FromUnixTimeMilliseconds(epoch)
                : DateTimeOffset.FromUnixTimeSeconds(epoch);

            return DateOnly.FromDateTime(moment.UtcDateTime);
        }

        string text = (Text(element) ?? string.Empty).Trim();

        if (DateOnly.TryParse(text, CultureInfo.InvariantCulture, DateTimeStyles.None, out DateOnly date))
            return date;

        // A timestamp with an offset: the business day is the sender's wall
        // clock, so the offset is honoured rather than converted to UTC. A
        // closing till at 00:30+02:00 means the 30th where it stands, and
        // converting would file the night's takings under the 29th.
        if (DateTimeOffset.TryParse(text, CultureInfo.InvariantCulture, DateTimeStyles.None, out DateTimeOffset stamp))
            return DateOnly.FromDateTime(stamp.DateTime);

        throw new ValidationException($"'{field}' is not a date: {text}");
    }

    private static TimeOnly? Clock(JsonElement? value, string field)
    {
        if (value is not JsonElement element) return null;

        string text = (Text(element) ?? string.Empty).Trim();

        if (text.Length == 0) return null;

        if (TimeOnly.TryParse(text, CultureInfo.InvariantCulture, DateTimeStyles.None, out TimeOnly time))
            return time;

        if (DateTimeOffset.TryParse(text, CultureInfo.InvariantCulture, DateTimeStyles.None, out DateTimeOffset stamp))
            return TimeOnly.FromDateTime(stamp.DateTime);

        throw new ValidationException($"'{field}' is not a time of day: {text}");
    }
}
