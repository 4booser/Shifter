using Shifter.Application.Common.Exceptions;
using Shifter.Application.Features.business.DTOs;
using Shifter.Application.Features.business.Services.Interfaces;
using Shifter.Domain.Entities;
using Shifter.Infrastructure.Repositories.Interfaces;

namespace Shifter.Application.Features.business.Services;

public class ShiftHandler : IShiftHandler
{
    private const int NameMaxLength = 40;

    private readonly IShifterCommand _shifterCommand;
    private readonly IShifterQuery _shifterQuery;

    public ShiftHandler(IShifterCommand shifterCommand, IShifterQuery shifterQuery)
    {
        _shifterCommand = shifterCommand;
        _shifterQuery = shifterQuery;
    }

    public async Task<ShiftDto[]> ListAsync(
        int userId,
        bool includeArchived,
        CancellationToken ct)
    {
        Shift[] shifts = await _shifterQuery.GetShiftsAsync(userId, includeArchived, ct);

        return shifts.Select(ToDto).ToArray();
    }

    public async Task<ShiftDto> CreateAsync(
        ShiftCreateDto request,
        int userId,
        CancellationToken ct)
    {
        Shift shift = new Shift()
        {
            UserId = userId,
            Name = string.Empty,
            StartTime = TimeOnly.MinValue,
            EndTime = TimeOnly.MinValue
        };

        Apply(request, shift);

        if (! await _shifterCommand.AddShiftAsync(shift, ct))
            throw new ForbiddenException("Can`t add shift.");

        // Re-read so the location navigation is populated: the response carries
        // the place's name and colour, and a freshly built entity has neither.
        return ToDto(await _shifterQuery.GetShiftAsync(userId, shift.Id, ct) ?? shift);
    }

    public async Task<ShiftDto> UpdateAsync(
        ShiftCreateDto request,
        int userId,
        int id,
        CancellationToken ct)
    {
        Shift shift = await _shifterQuery.GetShiftAsync(userId, id, ct)
            ?? throw new NotFoundException("Shift does not exist.");

        // Pay is derived from the template, so changing a rate also changes
        // every day this shift already sits on. Archiving and creating a
        // replacement is the way to leave history alone.
        Apply(request, shift);

        await _shifterCommand.SaveAsync(ct);

        return ToDto(await _shifterQuery.GetShiftAsync(userId, shift.Id, ct) ?? shift);
    }

    public async Task<ShiftDto> SetArchivedAsync(
        int userId,
        int id,
        bool archived,
        CancellationToken ct)
    {
        Shift shift = await _shifterQuery.GetShiftAsync(userId, id, ct)
            ?? throw new NotFoundException("Shift does not exist.");

        if (archived) shift.ToArchive();
        else shift.Restore();

        await _shifterCommand.SaveAsync(ct);

        return ToDto(shift);
    }

    /// <summary>Validation and assignment, shared by create and update.</summary>
    private static void Apply(ShiftCreateDto request, Shift shift)
    {
        if (string.IsNullOrWhiteSpace(request.name))
            throw new ValidationException("Name is empty.");

        if (request.name.Length > NameMaxLength)
            throw new ValidationException($"Name must be at most {NameMaxLength} characters.");

        TimeOnly start = ParseTime(request.start_time, "start_time");
        TimeOnly end = ParseTime(request.end_time, "end_time");

        // Equal times would mean a zero-length shift, which is never intended;
        // end < start is fine and simply means the shift runs past midnight.
        if (start == end)
            throw new ValidationException("Start and end time must differ.");

        if (request.salary_amount < 0)
            throw new ValidationException("Salary cannot be negative.");

        if (request.symbol?.Length > 8)
            throw new ValidationException("Symbol is too long for a badge.");

        // The break has to leave something behind to pay for: a break as long
        // as the shift means nobody was on the clock at all.
        TimeSpan length = start <= end ? end - start : end - start + TimeSpan.FromDays(1);

        if (request.break_minutes < 0)
            throw new ValidationException("Break cannot be negative.");

        if (request.break_minutes >= length.TotalMinutes)
            throw new ValidationException("Break must be shorter than the shift.");

        shift.Name = request.name.Trim();
        // Trimmed to a couple of graphemes: the badge is a badge, and an emoji
        // with skin tone or ZWJ still fits inside four UTF-16 units.
        shift.Symbol = string.IsNullOrWhiteSpace(request.symbol)
            ? null
            : request.symbol.Trim();
        shift.LocationId = request.location_id;
        shift.StartTime = start;
        shift.EndTime = end;
        shift.SalaryPeriod = ParsePeriod(request.salary_period);
        shift.SalaryAmount = request.salary_amount;

        // One unpaid stretch per template rather than a named list: the entity
        // supports several, but a shift with two separately timed breaks is not
        // something anyone has asked to type in.
        shift.Breaks = request.break_minutes > 0
            ? [new Break { Duration = TimeSpan.FromMinutes(request.break_minutes) }]
            : [];
    }

    internal static ShiftDto ToDto(Shift shift) => new ShiftDto(
        shift.Id,
        shift.Name,
        shift.Symbol,
        shift.StartTime.ToString("HH:mm"),
        shift.EndTime.ToString("HH:mm"),
        PeriodName(shift.SalaryPeriod),
        shift.SalaryAmount,
        (int)Math.Round((shift.Duration - shift.PaidDuration).TotalMinutes),
        Math.Round(shift.PaidDuration.TotalHours, 2),
        shift.LocationId,
        shift.Location?.Name,
        shift.Location?.Colour,
        shift.Archived
    );

    internal static string PeriodName(SalaryPeriod period) => period switch
    {
        SalaryPeriod.Hour => "hour",
        SalaryPeriod.Day => "day",
        SalaryPeriod.Week => "week",
        SalaryPeriod.Month => "month",
        _ => "hour"
    };

    private static SalaryPeriod ParsePeriod(string? value) => value?.ToLowerInvariant() switch
    {
        "hour" => SalaryPeriod.Hour,
        "day" => SalaryPeriod.Day,
        "week" => SalaryPeriod.Week,
        "month" => SalaryPeriod.Month,
        _ => throw new ValidationException(
            "salary_period must be one of: hour, day, week, month.")
    };

    private static TimeOnly ParseTime(string value, string field)
    {
        if (!TimeOnly.TryParseExact(value, "HH:mm", out TimeOnly parsed))
            throw new ValidationException($"{field} must look like HH:mm.");

        return parsed;
    }
}
