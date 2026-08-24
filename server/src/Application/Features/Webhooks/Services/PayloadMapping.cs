using System.Text.Json;
using Shifter.Application.Common.Exceptions;

namespace Shifter.Application.Features.Webhooks.Services;

/// <summary>
/// The endpoint's translation table, turning whatever a sender calls its fields
/// into the names this application reads.
///
/// It exists because every till and every rota exporter has its own shape, and
/// the alternative — a parser per provider, shipped in a release — means nobody
/// can connect anything the day they need to. A mapping is configuration: the
/// person pastes one example payload, names the fields, and it works.
///
/// The table is flat and its keys are canonical field names:
///
/// <code>
/// {
///   "$root": "data.object",          // where the useful part of the body starts
///   "date": "closed_at",
///   "tips": "totals.tip_money",
///   "sales": "line_items",           // the array
///   "sales.name": "catalogue.name",  // read inside each element of it
///   "sales.quantity": "qty",
///   "$divide": { "tips": 100 },      // the sender counts in cents
///   "worked": "=true"                // a literal, for what it never sends
/// }
/// </code>
///
/// A field with no entry falls back to its canonical name, so a sender that
/// already speaks the shape needs no mapping at all.
/// </summary>
public sealed class PayloadMapping
{
    /// <summary>A sender that already speaks the canonical shape.</summary>
    public static readonly PayloadMapping None = new PayloadMapping(null, [], []);

    private readonly string? _root;
    private readonly Dictionary<string, string> _paths;
    private readonly Dictionary<string, decimal> _divide;

    private PayloadMapping(
        string? root,
        Dictionary<string, string> paths,
        Dictionary<string, decimal> divide)
    {
        _root = root;
        _paths = paths;
        _divide = divide;
    }

    public static PayloadMapping Parse(string? json)
    {
        if (string.IsNullOrWhiteSpace(json)) return None;

        JsonElement root;

        try
        {
            using JsonDocument document = JsonDocument.Parse(json);

            root = document.RootElement.Clone();
        }
        catch (JsonException error)
        {
            throw new ValidationException($"The mapping is not valid JSON: {error.Message}");
        }

        if (root.ValueKind != JsonValueKind.Object)
            throw new ValidationException("The mapping must be a JSON object.");

        string? from = null;
        Dictionary<string, string> paths = [];
        Dictionary<string, decimal> divide = [];

        foreach (JsonProperty property in root.EnumerateObject())
        {
            switch (property.Name)
            {
                case "$root":
                    from = property.Value.GetString();
                    break;

                case "$divide":
                    if (property.Value.ValueKind != JsonValueKind.Object)
                        throw new ValidationException("$divide must be an object of field to number.");

                    foreach (JsonProperty scale in property.Value.EnumerateObject())
                    {
                        if (!scale.Value.TryGetDecimal(out decimal by) || by == 0m)
                        {
                            throw new ValidationException(
                                $"$divide.{scale.Name} must be a number other than zero.");
                        }

                        divide[scale.Name] = by;
                    }

                    break;

                default:
                    // Anything else names a field. A non-string value is almost
                    // always someone writing the example payload into the
                    // mapping box, so say that rather than ignoring it.
                    if (property.Value.ValueKind != JsonValueKind.String)
                    {
                        throw new ValidationException(
                            $"Mapping for '{property.Name}' must be a path, as a string.");
                    }

                    paths[property.Name] = property.Value.GetString() ?? string.Empty;
                    break;
            }
        }

        return new PayloadMapping(from, paths, divide);
    }

    /// <summary>
    /// Where reading starts. Providers habitually wrap the interesting object in
    /// an envelope of event ids and types, and $root skips past it once instead
    /// of prefixing every single path.
    /// </summary>
    public JsonElement Root(JsonElement body)
    {
        if (string.IsNullOrWhiteSpace(_root)) return body;

        return Resolve(body, _root) ?? throw new ValidationException(
            $"The payload has nothing at $root '{_root}'.");
    }

    /// <summary>
    /// The value for a canonical field, or null when the payload does not carry
    /// it. <paramref name="fallback"/> is the path used when the mapping says
    /// nothing — the field's own name for a top-level field, the bare name for
    /// one read inside an array element.
    /// </summary>
    public JsonElement? Read(JsonElement source, string field, string? fallback = null)
    {
        if (!_paths.TryGetValue(field, out string? path))
            return Resolve(source, fallback ?? field);

        // A literal, for the fields a sender simply never includes: "=true" for
        // hours that are always worked, "=Evening" where one endpoint only ever
        // reports the one shift.
        if (path.StartsWith('='))
            return Literal(path[1..]);

        return Resolve(source, path);
    }

    /// <summary>
    /// Applies the field's scale, if it has one. Cents are the case this exists
    /// for: a payment provider sends 4250 and the calendar means 42.50.
    /// </summary>
    public decimal Scale(string field, decimal value)
        => _divide.TryGetValue(field, out decimal by) ? value / by : value;

    /// <summary>
    /// Walks a dotted path, with [n] for array elements: "data.items[0].total".
    /// Missing is null rather than an error — most fields are optional, and the
    /// caller knows which of its own are not.
    /// </summary>
    private static JsonElement? Resolve(JsonElement source, string path)
    {
        if (string.IsNullOrWhiteSpace(path)) return null;

        JsonElement current = source;

        foreach (string segment in path.Split('.', StringSplitOptions.RemoveEmptyEntries))
        {
            string name = segment;

            // The name comes before any indexes: "items[0][1]" is a name then
            // two steps into what it holds.
            int bracket = name.IndexOf('[');
            string indexes = bracket < 0 ? string.Empty : name[bracket..];

            if (bracket >= 0) name = name[..bracket];

            if (name.Length > 0)
            {
                if (current.ValueKind != JsonValueKind.Object) return null;
                if (!current.TryGetProperty(name, out current)) return null;
            }

            foreach (string part in indexes.Split('[', StringSplitOptions.RemoveEmptyEntries))
            {
                if (!part.EndsWith(']')) return null;
                if (!int.TryParse(part[..^1], out int index)) return null;
                if (current.ValueKind != JsonValueKind.Array) return null;
                if (index < 0 || index >= current.GetArrayLength()) return null;

                current = current[index];
            }
        }

        return current.ValueKind == JsonValueKind.Null ? null : current;
    }

    /// <summary>
    /// A constant written into the mapping. Parsed as JSON first so "=true" and
    /// "=30" arrive as a boolean and a number; anything else stays a string.
    /// </summary>
    private static JsonElement Literal(string value)
    {
        try
        {
            using JsonDocument document = JsonDocument.Parse(value);

            return document.RootElement.Clone();
        }
        catch (JsonException)
        {
            using JsonDocument document = JsonDocument.Parse(JsonSerializer.Serialize(value));

            return document.RootElement.Clone();
        }
    }
}
