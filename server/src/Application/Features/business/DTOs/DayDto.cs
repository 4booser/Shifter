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
    /// <summary>What the shift took, where it was recorded.</summary>
    decimal? revenue,
    /// <summary>The agreed share of it, already inside earned.</summary>
    decimal? revenue_percent,
    bool worked,
    /// <summary>Asking the team to take this one.</summary>
    bool needs_cover,
    /// <summary>"HH:mm" where the recorded reality differs from the plan.</summary>
    string? actual_start,
    string? actual_end,
    /// <summary>Unpaid minutes inside the shift, as placed on this day.</summary>
    int break_minutes
    );

/// <summary>A day as the calendar reads it, with the money already worked out.</summary>
public record DayDto(
    DateOnly date,
    DayShiftDto[] shifts,
    DaySaleDto[] sales,
    decimal? tips,
    decimal? tips_cash,
    /// <summary>What the room took before the split, where the tips are pooled.</summary>
    decimal? tip_pool,
    /// <summary>Handed to support staff; already deducted from earned.</summary>
    decimal tip_out,
    /// <summary>Meal withholding plus fines; already deducted from earned.</summary>
    decimal deductions,
    string? note,
    /// <summary>Set by hand, as "#RRGGBB". Null means the cell colours itself.</summary>
    string? colour,
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
    /// <summary>Income tax withheld across the range.</summary>
    decimal tax,
    /// <summary>total_earned minus tax — what actually reaches a pocket.</summary>
    decimal net_earned,
    /// <summary>Holiday pay accrued, owed later and never part of net.</summary>
    decimal holiday_accrued,
    /// <summary>
    /// Every currency the range touches. More than one means the totals above
    /// are a mix and the client must show them per place instead.
    /// </summary>
    string[] currencies,
    /// <summary>Hours and money per place of work, worked shifts only.</summary>
    LocationTotalDto[] by_location,
    /// <summary>Hours past the weekly threshold.</summary>
    double overtime_hours,
    /// <summary>The premium those hours earned, on top of the base rate.</summary>
    decimal overtime_earned,
    /// <summary>Hours that fell inside a place's night window (premium places only).</summary>
    double night_hours,
    /// <summary>What the night and public-holiday rules added, on top of the base.</summary>
    decimal premium_earned,
    /// <summary>
    /// Everything overlapping the range, once each rather than repeated on
    /// every day it covers — a fortnight of leave is one entry, and the client
    /// spreads it across the cells itself.
    /// </summary>
    EventDto[] events
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
    string? note,
    /// <summary>
    /// "#RRGGBB", or null to clear it. Like everything else here it replaces
    /// rather than patches: the day is always sent whole.
    /// </summary>
    string? colour = null,
    /// <summary>
    /// The day's pool before the split. Where a shift on the day takes its
    /// tips from the pool, the person's own share is worked out from this and
    /// overwrites tips — the server prices, the client only reports.
    /// </summary>
    decimal? tip_pool = null
    );

public record DayShiftSaveDto(
    int shift_id,
    bool worked,
    /// <summary>Asking the team to take this one. Defaulted so older clients keep working.</summary>
    bool needs_cover = false,
    /// <summary>"HH:mm"; both edges or neither, and only meaningful once worked.</summary>
    string? actual_start = null,
    string? actual_end = null,
    /// <summary>Overrides the template's unpaid minutes; null keeps them.</summary>
    int? break_minutes = null,
    /// <summary>What this shift took. Null leaves it uncounted, not zero.</summary>
    decimal? revenue = null
    );

public record DaySaleSaveDto(
    int sales_id,
    int quantity
    );

/// <summary>
/// Colours a stretch of days in one round trip. Each date carries its own
/// value, so a pattern that alternates colours is one request rather than one
/// per colour — and a month painted a day at a time is thirty.
/// </summary>
public record BulkColourDto(
    /// <summary>Date to colour. Null clears whatever the day had.</summary>
    DayColourDto[] days
    );

public record DayColourDto(DateOnly date, string? colour);

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
