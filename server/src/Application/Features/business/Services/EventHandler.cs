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

        return events.Select(ToDto).ToArray();
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
        item.EndDate = request.end_date;
        item.StartTime = start;
        item.EndTime = end;
        item.Note = string.IsNullOrWhiteSpace(request.note) ? null : request.note.Trim();
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
        item.Days);

    [GeneratedRegex("^#[0-9A-Fa-f]{6}$")]
    private static partial Regex HexColour();
}
