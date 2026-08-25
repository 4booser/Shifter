using System.Text.Json;
using System.Text.Json.Serialization;

namespace Shifter.Application.Features.Import;

/// <summary>One recognised line of the rota: a date, a span, what it was called.</summary>
public sealed class ParsedShiftDto
{
    [JsonPropertyName("date")] public string Date { get; set; } = "";
    [JsonPropertyName("name")] public string Name { get; set; } = "";
    [JsonPropertyName("start")] public string Start { get; set; } = "";
    [JsonPropertyName("end")] public string End { get; set; } = "";
}

public sealed class ParsedScheduleDto
{
    [JsonPropertyName("days")] public List<ParsedShiftDto> Days { get; set; } = [];
}

/// <summary>
/// Turns whatever the model said into rows worth showing a person. Models
/// wrap JSON in prose and fences however firmly the prompt forbids it, so
/// the parser digs the outermost object out itself; rows that fail the
/// shape checks are dropped rather than guessed at.
/// </summary>
public static class ScheduleParse
{
    public static ParsedShiftDto[] FromModelText(string text)
    {
        int open = text.IndexOf('{');

        if (open < 0) return [];

        // Walk to the matching close brace of the first object, string-aware
        // enough for this shape: the payload never contains braces in values.
        int depth = 0;
        int close = -1;

        for (int index = open; index < text.Length; index += 1)
        {
            if (text[index] == '{') depth += 1;
            if (text[index] == '}' && --depth == 0)
            {
                close = index;
                break;
            }
        }

        if (close < 0) return [];

        ParsedScheduleDto? parsed;

        try
        {
            parsed = JsonSerializer.Deserialize<ParsedScheduleDto>(text[open..(close + 1)]);
        }
        catch (JsonException)
        {
            return [];
        }

        if (parsed is null) return [];

        return parsed.Days
            .Where(row =>
                DateOnly.TryParseExact(row.Date, "yyyy-MM-dd", out _)
                && TimeOnly.TryParseExact(row.Start, "HH:mm", out var from)
                && TimeOnly.TryParseExact(row.End, "HH:mm", out var to)
                && from != to)
            .GroupBy(row => row.Date)
            .Select(group => group.First())
            .OrderBy(row => row.Date)
            .ToArray();
    }

    /// <summary>The instruction the image travels with.</summary>
    public static string Prompt(string employee, int year, int month) =>
        $$"""
        This image is a work rota / shift schedule. Extract the shifts for the
        employee named "{{employee}}" (match the name loosely: initials,
        surname-only, transliteration).

        Rules:
        - Output STRICTLY one JSON object, no prose, no code fences:
          {"days":[{"date":"YYYY-MM-DD","name":"<shift label as written>","start":"HH:mm","end":"HH:mm"}]}
        - When the sheet shows day numbers without a month, assume {{year}}-{{month:00}}.
        - A cell like "11-22" or "11:00-22:00" means start 11:00 end 22:00.
        - Letters codes (Д/Н/В etc.) are the shift name; give your best-guess
          times only when the sheet legend defines them, otherwise use
          "00:00" for both to signal unknown times.
        - Days off, empty cells and other employees are omitted entirely.
        - If the employee cannot be found, output {"days":[]}.
        """;
}
