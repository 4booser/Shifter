using System.Text.Json;
using Shifter.Application.Common.Exceptions;

namespace Shifter.Application.Features.Webhooks.Services;

/// <summary>The endpoint's translation table, turning whatever a sender calls its fields into the names this application…</summary>
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

    /// <summary>Where reading starts.</summary>
    public JsonElement Root(JsonElement body)
    {
        if (string.IsNullOrWhiteSpace(_root)) return body;

        return Resolve(body, _root) ?? throw new ValidationException(
            $"The payload has nothing at $root '{_root}'.");
    }

    /// <summary>The value for a canonical field, or null when the payload does not carry it.</summary>
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

    /// <summary>Applies the field's scale, if it has one.</summary>
    public decimal Scale(string field, decimal value)
        => _divide.TryGetValue(field, out decimal by) ? value / by : value;

    /// <summary>Walks a dotted path, with [n] for array elements: "data.items[0].total".</summary>
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

    /// <summary>A constant written into the mapping.</summary>
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
