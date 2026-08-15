namespace Shifter.Application.Features.business.DTOs;

/// <summary>One sold position on a day: which one, and how many.</summary>
public record DaySaleDto(
    int sales_id,
    string name,
    int quantity,
    decimal unit_price,
    decimal percentage,
    decimal earned
    );

/// <summary>
/// One shift placed on a day, with the terms it was placed under rather than
/// the template's current ones.
/// </summary>
public record DayShiftDto(
    int shift_id,
    string name,
    string? symbol,
    string? colour,
    string start_time,
    string end_time,
    double hours,
    decimal earned,
    bool worked
    );

/// <summary>A day as the calendar reads it, with the money already worked out.</summary>
public record DayDto(
    DateOnly date,
    DayShiftDto[] shifts,
    DaySaleDto[] sales,
    decimal? tips,
    decimal? tips_cash,
    /// <summary>Handed to support staff; already deducted from earned.</summary>
    decimal tip_out,
    /// <summary>Meal withholding plus fines; already deducted from earned.</summary>
    decimal deductions,
    string? note,
    /// <summary>Paid hours of the shifts marked worked.</summary>
    double hours,
    /// <summary>Money from shifts already worked, plus sales and tips.</summary>
    decimal earned,
    /// <summary>Money from shifts still only planned.</summary>
    decimal planned
    );

/// <summary>
/// A range of days plus its totals. The breakdown is computed here rather than
/// on the client so the pay rules live in exactly one place.
/// </summary>
public record DaysDto(
    DayDto[] days,
    double hours,
    double planned_hours,
    decimal shifts_earned,
    decimal sales_earned,
    decimal tips_earned,
    /// <summary>Weekly and monthly wages, counted once per period they cover.</summary>
    decimal period_earned,
    /// <summary>Everything already earned in the range.</summary>
    decimal total_earned,
    /// <summary>Shifts in the range that are still ahead.</summary>
    decimal planned_earned,
    int days_worked,
    int days_planned,
    /// <summary>Payouts whose period ends inside the range.</summary>
    decimal paid,
    /// <summary>paid minus total_earned: negative means short.</summary>
    decimal difference,
    /// <summary>Total handed to support staff across the range.</summary>
    decimal tip_out,
    /// <summary>Meals withheld plus fines across the range.</summary>
    decimal deductions,
    /// <summary>Hours and money per place of work, worked shifts only.</summary>
    LocationTotalDto[] by_location,
    /// <summary>Hours past the weekly threshold.</summary>
    double overtime_hours,
    /// <summary>The premium those hours earned, on top of the base rate.</summary>
    decimal overtime_earned
    );

/// <summary>
/// What the client sends when saving a day. It carries the whole contents, not
/// a patch, so the server replaces rather than merges.
/// </summary>
public record DaySaveDto(
    DayShiftSaveDto[]? shifts,
    DaySaleSaveDto[]? sales,
    decimal? tips,
    decimal? tips_cash,
    decimal? deductions,
    string? note
    );

public record DayShiftSaveDto(
    int shift_id,
    bool worked
    );

public record DaySaleSaveDto(
    int sales_id,
    int quantity
    );

/// <summary>
/// Applies one template across many dates in a single round trip. Dragging a
/// week or generating a rota otherwise costs one request per day.
/// </summary>
public record BulkShiftDto(
    DateOnly[] dates,
    int shift_id,
    /// <summary>"add" or "remove".</summary>
    string mode
    );
