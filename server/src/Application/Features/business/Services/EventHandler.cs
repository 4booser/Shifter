using System.Globalization;
using System.Text.RegularExpressions;
using Shifter.Application.Common.Exceptions;
using Shifter.Application.Features.business.DTOs;
using Shifter.Application.Features.business.Services.Interfaces;
using Shifter.Domain.Entities;
using Shifter.Infrastructure.Repositories.Interfaces;

namespace Shifter.Application.Features.business.Services;

public partial class EventHandler : IEventHandler
{
    private const int NameMaxLength = 80;
    private const int NoteMaxLength = 500;

    /// <summary>
    /// A guard against a runaway range rather than a rule about how long leave
    /// may be: a bad end date would otherwise paint years of calendar.
    /// </summary>
    private const int MaxDays = 400;

    private readonly IShifterCommand _shifterCommand;
    private readonly IShifterQuery _shifterQuery;

    public EventHandler(IShifterCommand shifterCommand, IShifterQuery shifterQuery)
    {
        _shifterCommand = shifterCommand;
        _shifterQuery = shifterQuery;
    }

    public async Task<EventDto[]> ListAsync(
        int userId,
        DateOnly from,
        DateOnly to,
        CancellationToken ct)
    {
        if (from > to)
            throw new ValidationException("Range start must not be after its end.");

        Event[] events = await _shifterQuery.GetEventsInRangeAsync(userId, from, to, ct);

        // One-offs pass through whole; a repeating event unfolds into one
        // single-day entry per occurrence, all wearing the rule's id so
        // editing any of them edits the rule.
        return events
            .SelectMany(item => item.Repeats
                ? EventRecurrence.Occurrences(item, from, to).Select(date => ToOccurrence(item, date))
                : [ToDto(item)])
            .OrderBy(dto => dto.start_date)
            .ToArray();
    }

    public async Task<EventDto> CreateAsync(
        EventSaveDto request,
        int userId,
        CancellationToken ct)
    {
        Event item = new Event
        {
            UserId = userId,
            Name = string.Empty,
            Colour = string.Empty,
            StartDate = request.start_date,
            EndDate = request.end_date
        };

        Apply(request, item);

        await _shifterCommand.AddEventAsync(item, ct);

        return ToDto(item);
    }

    public async Task<EventDto> UpdateAsync(
        EventSaveDto request,
        int userId,
        int id,
        CancellationToken ct)
    {
        Event item = await _shifterQuery.GetEventAsync(userId, id, ct)
            ?? throw new NotFoundException("Event does not exist.");

        Apply(request, item);

        await _shifterCommand.SaveAsync(ct);

        return ToDto(item);
    }

    public async Task DeleteAsync(int userId, int id, CancellationToken ct)
    {
        Event item = await _shifterQuery.GetEventAsync(userId, id, ct)
            ?? throw new NotFoundException("Event does not exist.");

        await _shifterCommand.DeleteEventAsync(item, ct);
    }

    /// <summary>
    /// Validates and writes in one place, so create and update cannot drift
    /// into accepting different things.
    /// </summary>
    private static void Apply(EventSaveDto request, Event item)
    {
        string name = request.name?.Trim() ?? string.Empty;

        if (name.Length == 0)
            throw new ValidationException("Event needs a name.");

        if (name.Length > NameMaxLength)
            throw new ValidationException($"Name must be at most {NameMaxLength} characters.");

        if (request.note?.Length > NoteMaxLength)
            throw new ValidationException($"Note must be at most {NoteMaxLength} characters.");

        if (!HexColour().IsMatch(request.colour ?? string.Empty))
            throw new ValidationException("Colour must be a hex value like #1F3A5F.");

        if (request.repeat_weekdays is not null)
        {
            if (EventRecurrence.ParseWeekdays(request.repeat_weekdays).Count == 0)
                throw new ValidationException("Pick at least one weekday to repeat on.");

            if (request.repeat_until is DateOnly until && until < request.start_date)
                throw new ValidationException("The repetition cannot end before it starts.");
        }

        if (request.start_date > request.end_date)
            throw new ValidationException("Event start must not be after its end.");

        if (request.end_date.DayNumber - request.start_date.DayNumber + 1 > MaxDays)
            throw new ValidationException($"An event may span at most {MaxDays} days.");

        TimeOnly? start = ParseTime(request.start_time, "start");
        TimeOnly? end = ParseTime(request.end_time, "end");

        // An end without a start says nothing about when anything happens, and
        // would render as a lone time in the cell.
        if (start is null && end is not null)
            throw new ValidationException("An end time needs a start time.");

        item.Name = name;
        item.Symbol = string.IsNullOrWhiteSpace(request.symbol) ? null : request.symbol.Trim();
        item.Colour = request.colour!.ToUpperInvariant();
        item.StartDate = request.start_date;
        item.RepeatWeekdays = request.repeat_weekdays;
        item.RepeatUntil = request.repeat_weekdays is null ? null : request.repeat_until;
        // A repeating event is its anchor day plus the rule; a range would
        // mean "this fortnight, every Tuesday", which nobody means.
        item.EndDate = request.repeat_weekdays is null ? request.end_date : request.start_date;
        item.StartTime = start;
        item.EndTime = end;
        item.Note = string.IsNullOrWhiteSpace(request.note) ? null : request.note.Trim();
        item.Kind = ParseKind(request.kind);
    }

    /// <summary>
    /// "HH:mm" or nothing. Deliberately strict: a time the server cannot read
    /// is a bug in the client, and silently dropping it would hide it.
    /// </summary>
    private static TimeOnly? ParseTime(string? value, string which)
    {
        if (string.IsNullOrWhiteSpace(value)) return null;

        if (!TimeOnly.TryParseExact(
                value.Trim(),
                "HH:mm",
                CultureInfo.InvariantCulture,
                DateTimeStyles.None,
                out TimeOnly parsed))
        {
            throw new ValidationException($"Event {which} time must look like 09:00.");
        }

        return parsed;
    }

    /// <summary>
    /// Internal so the range endpoint can send events alongside days without a
    /// second copy of this mapping drifting away from it.
    /// </summary>
    internal static EventDto ToDto(Event item) => new EventDto(
        item.Id,
        item.Name,
        item.Symbol,
        item.Colour,
        item.StartDate,
        item.EndDate,
        item.StartTime?.ToString("HH:mm"),
        item.EndTime?.ToString("HH:mm"),
        item.Note,
        KindName(item.Kind),
        item.Days,
        item.RepeatWeekdays,
        item.RepeatUntil);

    private static EventDto ToOccurrence(Event item, DateOnly date) => new EventDto(
        item.Id,
        item.Name,
        item.Symbol,
        item.Colour,
        date,
        date,
        item.StartTime?.ToString("HH:mm"),
        item.EndTime?.ToString("HH:mm"),
        item.Note,
        KindName(item.Kind),
        1,
        item.RepeatWeekdays,
        item.RepeatUntil);

    internal static string KindName(EventKind kind) => kind switch
    {
        EventKind.Vacation => "vacation",
        EventKind.Sick => "sick",
        EventKind.DayOff => "dayoff",
        _ => "ordinary",
    };

    private static EventKind ParseKind(string? value) => value?.Trim().ToLowerInvariant() switch
    {
        "vacation" => EventKind.Vacation,
        "sick" => EventKind.Sick,
        "dayoff" => EventKind.DayOff,
        null or "" or "ordinary" => EventKind.Ordinary,
        _ => throw new ValidationException("kind must be ordinary, vacation, sick or dayoff."),
    };

    [GeneratedRegex("^#[0-9A-Fa-f]{6}$")]
    private static partial Regex HexColour();
}
