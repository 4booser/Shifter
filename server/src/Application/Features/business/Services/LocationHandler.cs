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

    public async Task DeleteAsync(int userId, int id, bool detach, CancellationToken ct)
    {
        Location location = await _shifterQuery.GetLocationAsync(userId, id, ct)
            ?? throw new NotFoundException("Location does not exist.");

        int shifts = await _shifterCommand.CountShiftsAtLocationAsync(id, ct);

        // Deleting takes the place off every shift that used it, and with it
        // that place's tip-out, meal and tax rules — so days already worked
        // stop being worth what they were. That is a real consequence and the
        // caller has to ask for it explicitly; refusing outright, as this used
        // to, left no way to remove a place that was simply a mistake.
        if (shifts > 0 && !detach)
        {
            throw new ConflictException(
                $"{shifts} shifts still use this place. Delete it anyway to "
                + "remove it from them, or archive it to keep the history.");
        }

        if (shifts > 0) await _shifterCommand.DetachShiftsFromLocationAsync(id, ct);

        await _shifterCommand.DeleteLocationAsync(location, ct);
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

        // Both or neither, and on the planet: a half-set coordinate would put
        // the nudge in the Gulf of Guinea.
        if (request.latitude.HasValue != request.longitude.HasValue)
            throw new ValidationException("Latitude and longitude come together.");

        if (request.latitude is double latitude && request.longitude is double longitude)
        {
            if (latitude is < -90 or > 90 || longitude is < -180 or > 180)
                throw new ValidationException("Those coordinates are not on Earth.");

            location.Latitude = latitude;
            location.Longitude = longitude;
        }
        else
        {
            location.Latitude = null;
            location.Longitude = null;
        }
        location.Colour = request.colour!.ToUpperInvariant();
        location.PayPeriod = ParsePeriod(request.pay_period);
        location.PayDay = request.pay_day;
        location.PayAnchor = request.pay_anchor ?? location.PayAnchor;

        // An empty cycle is not a missing answer, it is the answer: the
        // commission is paid with everything else, which is what almost every
        // place does.
        if (string.IsNullOrWhiteSpace(request.sales_pay_period))
        {
            location.SalesPayPeriod = null;
        }
        else
        {
            if (request.sales_pay_day is < 1 or > 28)
                throw new ValidationException("Commission pay day must be between 1 and 28.");

            location.SalesPayPeriod = ParsePeriod(request.sales_pay_period);
            location.SalesPayDay = request.sales_pay_day;
            location.SalesPayAnchor = request.sales_pay_anchor ?? location.SalesPayAnchor;
        }

        // A threshold of zero would make every hour overtime; a multiplier
        // below one would make overtime pay less than normal time.
        if (request.overtime_weekly_hours is < 1 or > 168)
            throw new ValidationException("Overtime threshold must be between 1 and 168 hours.");

        if (request.overtime_multiplier < 1)
            throw new ValidationException("Overtime multiplier cannot be below 1.");

        location.OvertimeWeeklyHours = request.overtime_weekly_hours;
        location.OvertimeMultiplier = request.overtime_multiplier;

        if (request.tip_out_of_tips_percent is < 0 or > 100
            || request.tip_out_of_sales_percent is < 0 or > 100)
        {
            throw new ValidationException("Tip-out must be between 0 and 100 percent.");
        }

        location.TipOutOfTipsPercent = request.tip_out_of_tips_percent;
        location.TipOutOfSalesPercent = request.tip_out_of_sales_percent;

        if (request.meal_deduction < 0)
            throw new ValidationException("Meal deduction cannot be negative.");

        location.MealDeduction = request.meal_deduction;

        if (request.tax_percent is < 0 or > 100)
            throw new ValidationException("Tax must be between 0 and 100 percent.");

        if (request.holiday_percent is < 0 or > 100)
            throw new ValidationException("Holiday pay must be between 0 and 100 percent.");

        location.TaxPercent = request.tax_percent;
        location.TaxTips = request.tax_tips;
        location.HolidayPercent = request.holiday_percent;

        // Three letters or nothing: an empty value means the place pays in
        // whatever the app is set to, which is the common case.
        string currency = (request.currency ?? string.Empty).Trim().ToUpperInvariant();

        if (currency.Length is not 0 and not 3)
            throw new ValidationException("Currency must be a three-letter code such as EUR.");

        location.Currency = currency;
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
            location.TipOutOfTipsPercent,
            location.TipOutOfSalesPercent,
            location.MealDeduction,
            location.TaxPercent,
            location.TaxTips,
            location.HolidayPercent,
            location.Currency,
            location.Archived,
            location.SalesPayPeriod is PayPeriod sales ? PeriodName(sales) : string.Empty,
            location.SalesPayDay,
            location.SalesPayAnchor,
            location.Latitude,
            location.Longitude
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
