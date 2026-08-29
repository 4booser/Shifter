namespace Shifter.Application.Features.business.DTOs;

/// <summary>
/// A place of work. current_period_from/to are the pay period containing today,
/// so the client can offer "this pay period" without knowing the rules.
/// </summary>
public record LocationDto(
    int id,
    string name,
    string? address,
    string colour,
    string pay_period,
    int pay_day,
    DateOnly pay_anchor,
    DateOnly current_period_from,
    DateOnly current_period_to,
    double overtime_weekly_hours,
    decimal overtime_multiplier,
    decimal night_multiplier,
    string night_from,
    string night_to,
    decimal public_holiday_multiplier,
    string holiday_country,
    decimal tip_out_of_tips_percent,
    decimal tip_out_of_sales_percent,
    decimal meal_deduction,
    decimal tax_percent,
    bool tax_tips,
    decimal holiday_percent,
    /// <summary>Empty means "same as the app's currency".</summary>
    string currency,
    bool archived,
    /// <summary>
    /// Empty where the sales commission is paid with everything else; otherwise
    /// the cycle it settles on, with its own day and anchor.
    /// </summary>
    string sales_pay_period = "",
    int sales_pay_day = 1,
    DateOnly sales_pay_anchor = default,
    double? latitude = null,
    double? longitude = null,
    /// <summary>Hours after which an unpaid break applies itself. Zero is off.</summary>
    decimal auto_break_after_hours = 0m,
    int auto_break_minutes = 0,
    /// <summary>The hourly rate this person will not go under here. Zero is off.</summary>
    decimal minimum_hourly = 0m,
    /// <summary>The journey here, one way, in minutes. Zero means nobody said.</summary>
    int commute_minutes = 0,
    /// <summary>What one trip costs, one way.</summary>
    decimal commute_cost = 0m,
    /// <summary>The city, as its owner names it. Empty means unsaid.</summary>
    string city = ""
    );

public record LocationCreateDto(
    string name,
    string? address,
    string colour,
    string pay_period,
    int pay_day,
    DateOnly? pay_anchor,
    double overtime_weekly_hours,
    decimal overtime_multiplier,
    decimal night_multiplier,
    string night_from,
    string night_to,
    decimal public_holiday_multiplier,
    string holiday_country,
    decimal tip_out_of_tips_percent,
    decimal tip_out_of_sales_percent,
    decimal meal_deduction,
    decimal tax_percent,
    bool tax_tips,
    decimal holiday_percent,
    string? currency,
    /// <summary>Empty or absent leaves the commission on the main cycle.</summary>
    string? sales_pay_period = null,
    int sales_pay_day = 1,
    DateOnly? sales_pay_anchor = null,
    double? latitude = null,
    double? longitude = null,
    /// <summary>
    /// Defaulted like everything below the colour: a client written before
    /// these existed must keep saving places rather than silently clearing
    /// rules somebody set on the other screen.
    /// </summary>
    decimal auto_break_after_hours = 0m,
    int auto_break_minutes = 0,
    decimal minimum_hourly = 0m,
    int commute_minutes = 0,
    decimal commute_cost = 0m,
    /// <summary>Null or empty leaves the city unsaid.</summary>
    string? city = null
    );

/// <summary>Money and hours attributed to one location inside a range.</summary>
public record LocationTotalDto(
    int location_id,
    string name,
    string colour,
    double hours,
    decimal earned,
    int days_worked,
    decimal tips,
    decimal sales,
    decimal tip_out,
    decimal deductions,
    /// <summary>Everything the place produced per paid hour.</summary>
    decimal per_hour,
    /// <summary>Withheld at source by this place.</summary>
    decimal tax,
    /// <summary>earned minus tax: what actually arrives.</summary>
    decimal net,
    /// <summary>Holiday pay accrued here, owed but not yet paid.</summary>
    decimal holiday,
    string currency,
    /// <summary>
    /// The same place with the journey counted in. Null where nobody has said
    /// how far it is — an unstated commute is not a commute of zero, and
    /// pretending otherwise would invent a comparison.
    /// </summary>
    CommuteDto? commute = null
    );

/// <summary>
/// What getting to a place costs, and what it does to the hourly rate. An
/// estimate throughout, which is why it lives in its own object rather than
/// being folded into the earnings beside it.
/// </summary>
public record CommuteDto(
    /// <summary>One way, in minutes.</summary>
    int minutes,
    /// <summary>One trip, one way.</summary>
    decimal cost,
    /// <summary>Hours spent travelling to and from, over the range.</summary>
    double travel_hours,
    /// <summary>Fares over the range, both ways.</summary>
    decimal fares,
    /// <summary>Paid hours plus travelling.</summary>
    double hours_with_travel,
    /// <summary>Take-home less the fares.</summary>
    decimal net_after_fares,
    /// <summary>The number this is all for: what an hour is really worth here.</summary>
    decimal per_hour_with_travel);
