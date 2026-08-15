using System.Text.RegularExpressions;
using Shifter.Application.Common.Exceptions;
using Shifter.Application.Features.business.DTOs;
using Shifter.Application.Features.business.Services.Interfaces;
using Shifter.Domain.Entities;
using Shifter.Infrastructure.Repositories.Interfaces;

namespace Shifter.Application.Features.business.Services;

public partial class LocationHandler : ILocationHandler
{
    private const int NameMaxLength = 60;

    private readonly IShifterCommand _shifterCommand;
    private readonly IShifterQuery _shifterQuery;

    public LocationHandler(IShifterCommand shifterCommand, IShifterQuery shifterQuery)
    {
        _shifterCommand = shifterCommand;
        _shifterQuery = shifterQuery;
    }

    public async Task<LocationDto[]> ListAsync(
        int userId,
        bool includeArchived,
        CancellationToken ct)
    {
        Location[] locations = await _shifterQuery.GetLocationsAsync(userId, includeArchived, ct);

        return locations.Select(ToDto).ToArray();
    }

    public async Task<LocationDto> CreateAsync(
        LocationCreateDto request,
        int userId,
        CancellationToken ct)
    {
        Location location = new Location() { UserId = userId, Name = string.Empty };

        Apply(request, location);

        if (! await _shifterCommand.AddLocationAsync(location, ct))
            throw new ForbiddenException("Can`t add location.");

        return ToDto(location);
    }

    public async Task<LocationDto> UpdateAsync(
        LocationCreateDto request,
        int userId,
        int id,
        CancellationToken ct)
    {
        Location location = await _shifterQuery.GetLocationAsync(userId, id, ct)
            ?? throw new NotFoundException("Location does not exist.");

        // Safe to change: pay is snapshotted onto each placement, and a period
        // boundary only affects how future totals are grouped.
        Apply(request, location);

        await _shifterCommand.SaveAsync(ct);

        return ToDto(location);
    }

    public async Task<LocationDto> SetArchivedAsync(
        int userId,
        int id,
        bool archived,
        CancellationToken ct)
    {
        Location location = await _shifterQuery.GetLocationAsync(userId, id, ct)
            ?? throw new NotFoundException("Location does not exist.");

        if (archived) location.ToArchive();
        else location.Restore();

        await _shifterCommand.SaveAsync(ct);

        return ToDto(location);
    }

    private static void Apply(LocationCreateDto request, Location location)
    {
        if (string.IsNullOrWhiteSpace(request.name))
            throw new ValidationException("Name is empty.");

        if (request.name.Length > NameMaxLength)
            throw new ValidationException($"Name must be at most {NameMaxLength} characters.");

        if (!HexColour().IsMatch(request.colour ?? string.Empty))
            throw new ValidationException("Colour must be a hex value like #1F3A5F.");

        // 29 to 31 do not exist in every month, so a payday there would skip
        // periods; the calculator clamps, and rejecting here says so plainly.
        if (request.pay_day is < 1 or > 28)
            throw new ValidationException("Pay day must be between 1 and 28.");

        location.Name = request.name.Trim();
        location.Address = string.IsNullOrWhiteSpace(request.address) ? null : request.address.Trim();
        location.Colour = request.colour!.ToUpperInvariant();
        location.PayPeriod = ParsePeriod(request.pay_period);
        location.PayDay = request.pay_day;
        location.PayAnchor = request.pay_anchor ?? location.PayAnchor;

        // A threshold of zero would make every hour overtime; a multiplier
        // below one would make overtime pay less than normal time.
        if (request.overtime_weekly_hours is < 1 or > 168)
            throw new ValidationException("Overtime threshold must be between 1 and 168 hours.");

        if (request.overtime_multiplier < 1)
            throw new ValidationException("Overtime multiplier cannot be below 1.");

        location.OvertimeWeeklyHours = request.overtime_weekly_hours;
        location.OvertimeMultiplier = request.overtime_multiplier;
    }

    internal static LocationDto ToDto(Location location)
    {
        var (from, to) = PayPeriodCalculator.PeriodFor(
            location, DateOnly.FromDateTime(DateTime.UtcNow));

        return new LocationDto(
            location.Id,
            location.Name,
            location.Address,
            location.Colour,
            PeriodName(location.PayPeriod),
            location.PayDay,
            location.PayAnchor,
            from,
            to,
            location.OvertimeWeeklyHours,
            location.OvertimeMultiplier,
            location.Archived
        );
    }

    internal static string PeriodName(PayPeriod period) => period switch
    {
        PayPeriod.Monthly => "monthly",
        PayPeriod.SemiMonthly => "semimonthly",
        PayPeriod.BiWeekly => "biweekly",
        PayPeriod.Weekly => "weekly",
        _ => "monthly"
    };

    private static PayPeriod ParsePeriod(string? value) => value?.ToLowerInvariant() switch
    {
        "monthly" => PayPeriod.Monthly,
        "semimonthly" => PayPeriod.SemiMonthly,
        "biweekly" => PayPeriod.BiWeekly,
        "weekly" => PayPeriod.Weekly,
        _ => throw new ValidationException(
            "pay_period must be one of: monthly, semimonthly, biweekly, weekly.")
    };

    [GeneratedRegex("^#[0-9A-Fa-f]{6}$")]
    private static partial Regex HexColour();
}
