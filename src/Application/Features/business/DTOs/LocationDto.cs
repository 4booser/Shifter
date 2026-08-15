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
    decimal tip_out_of_tips_percent,
    decimal tip_out_of_sales_percent,
    decimal meal_deduction,
    bool archived
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
    decimal tip_out_of_tips_percent,
    decimal tip_out_of_sales_percent,
    decimal meal_deduction
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
    decimal per_hour
    );
