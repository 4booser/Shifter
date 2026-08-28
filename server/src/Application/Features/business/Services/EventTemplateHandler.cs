using System.Globalization;
using System.Text.RegularExpressions;
using Shifter.Application.Common.Exceptions;
using Shifter.Application.Features.business.DTOs;
using Shifter.Application.Features.business.Services.Interfaces;
using Shifter.Domain.Entities;
using Shifter.Infrastructure.Repositories.Interfaces;

namespace Shifter.Application.Features.business.Services;

/// <summary>
/// The palette for everything on the calendar that is not a shift. It exists
/// for the same reason the shift palette does: a week is filled by picking a
/// thing and putting it on days, and typing «английский, 19:00–20:30, 400»
/// out again every Tuesday is exactly the friction that stops people filling
/// the calendar in at all.
///
/// The money it carries points outward. Nothing here is ever added to what a
/// week earned — the day earned what it earned, and the driving lesson is a
/// second figure beside it.
/// </summary>
public partial class EventTemplateHandler : IEventTemplateHandler
{
    private readonly IShifterCommand _command;
    private readonly IShifterQuery _query;

    public EventTemplateHandler(IShifterCommand command, IShifterQuery query)
    {
        _command = command;
        _query = query;
    }

    public async Task<EventTemplateDto[]> ListAsync(int userId, bool includeArchived, CancellationToken ct)
        => (await _query.GetEventTemplatesAsync(userId, includeArchived, ct)).Select(ToDto).ToArray();

    public async Task<EventTemplateDto> CreateAsync(EventTemplateSaveDto request, int userId, CancellationToken ct)
    {
        var item = new EventTemplate
        {
            UserId = userId,
            Name = string.Empty,
            Colour = "#000000",
        };

        Apply(request, item);

        await _command.AddEventTemplateAsync(item, ct);

        return ToDto(item);
    }

    public async Task<EventTemplateDto> UpdateAsync(
        EventTemplateSaveDto request, int userId, int id, CancellationToken ct)
    {
        var item = await _query.GetEventTemplateAsync(userId, id, ct)
            ?? throw new NotFoundException("Event template does not exist.");

        Apply(request, item);

        await _command.SaveAsync(ct);

        return ToDto(item);
    }

    /// <summary>
    /// Archiving, not deleting: the events already on the calendar carry their
    /// own copy of everything, so the row could go safely — but somebody who
    /// stops taking lessons in June wants the choice gone from the palette,
    /// not the spring erased from the year.
    /// </summary>
    public async Task ArchiveAsync(int userId, int id, bool archived, CancellationToken ct)
    {
        var item = await _query.GetEventTemplateAsync(userId, id, ct)
            ?? throw new NotFoundException("Event template does not exist.");

        item.Archived = archived;

        await _command.SaveAsync(ct);
    }

    public async Task DeleteAsync(int userId, int id, CancellationToken ct)
    {
        var item = await _query.GetEventTemplateAsync(userId, id, ct)
            ?? throw new NotFoundException("Event template does not exist.");

        await _command.DeleteEventTemplateAsync(item, ct);
    }

    private static void Apply(EventTemplateSaveDto request, EventTemplate item)
    {
        var name = request.name?.Trim() ?? string.Empty;

        if (name.Length == 0)
            throw new ValidationException("Event template needs a name.");

        if (name.Length > EventTemplate.NameMax)
            throw new ValidationException($"Name must be at most {EventTemplate.NameMax} characters.");

        if (!HexColour().IsMatch(request.colour ?? string.Empty))
            throw new ValidationException("Colour must be a hex value like #1F3A5F.");

        var start = ParseTime(request.start_time, "start");
        var end = ParseTime(request.end_time, "end");

        // An end without a start says nothing about when anything happens.
        if (start is null && end is not null)
            throw new ValidationException("An end time needs a start time.");

        if (request.cost is decimal cost && cost < 0)
            throw new ValidationException("An event cannot cost a negative amount.");

        item.Name = name;
        item.Symbol = string.IsNullOrWhiteSpace(request.symbol) ? null : request.symbol.Trim();
        item.Colour = request.colour!.ToUpperInvariant();
        item.Kind = ParseKind(request.kind);
        item.StartTime = start;
        item.EndTime = end;
        item.Cost = request.cost;
    }

    private static TimeOnly? ParseTime(string? value, string which)
    {
        if (string.IsNullOrWhiteSpace(value)) return null;

        if (!TimeOnly.TryParseExact(
                value.Trim(), "HH:mm", CultureInfo.InvariantCulture, DateTimeStyles.None, out var parsed))
        {
            throw new ValidationException($"Event {which} time must look like 09:00.");
        }

        return parsed;
    }

    private static EventKind ParseKind(string? value) => value?.Trim().ToLowerInvariant() switch
    {
        "vacation" => EventKind.Vacation,
        "sick" => EventKind.Sick,
        "dayoff" => EventKind.DayOff,
        null or "" or "ordinary" => EventKind.Ordinary,
        _ => throw new ValidationException("kind must be ordinary, vacation, sick or dayoff."),
    };

    /// <summary>
    /// Hours the palette can print beside the name, the way a shift shows its
    /// span. A lesson that runs past midnight is measured the same way a night
    /// shift is — the clock wrapping is not a negative evening.
    /// </summary>
    private static double Hours(TimeOnly? start, TimeOnly? end)
    {
        if (start is null || end is null) return 0;

        var span = (end.Value - start.Value).TotalHours;

        return span <= 0 ? span + 24 : span;
    }

    private static EventTemplateDto ToDto(EventTemplate item) => new(
        item.Id,
        item.Name,
        item.Symbol,
        item.Colour,
        EventHandler.KindName(item.Kind),
        item.StartTime?.ToString("HH:mm"),
        item.EndTime?.ToString("HH:mm"),
        item.Cost,
        item.Archived,
        Math.Round(Hours(item.StartTime, item.EndTime), 2));

    [GeneratedRegex("^#[0-9A-Fa-f]{6}$")]
    private static partial Regex HexColour();
}
