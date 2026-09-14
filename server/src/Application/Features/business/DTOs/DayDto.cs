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

/// <summary>One shift placed on a day, with the terms it was placed under rather than the template's current ones.</summary>
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
    /// <summary>How many the shift served, where anybody counted.</summary>
    int? guests,
    /// <summary>Where in the venue: "hall", "bar", "terrace", "banquet", "takeaway", or "unset" where nobody said.</summary>
    string zone,
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
    /// <summary>Why the fine, where it was said: breakage, shortfall, late, waste, uniform, other.</summary>
    string? deduction_reason,
    string? note,
    /// <summary>Set by hand, as "#RRGGBB". Null means the cell colours itself.</summary>
    string? colour,
    /// <summary>A worked shift here paid less per hour than the floor its place is set to.</summary>
    bool below_floor,
    /// <summary>Paid hours of the shifts marked worked.</summary>
    double hours,
    /// <summary>Money from shifts already worked, plus sales and tips.</summary>
    decimal earned,
    /// <summary>Money from shifts still only planned.</summary>
    decimal planned
    ,
    /// <summary>Bumped on every save.</summary>
    int version = 0);

/// <summary>A range of days plus its totals.</summary>
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
    /// <summary>The fines alone, split by what caused them.</summary>
    DeductionReasonDto[] deductions_by_reason,
    /// <summary>Every time the rate moved on a shift worked in the range, newest first.</summary>
    RaiseDto[] raises,
    /// <summary>What the work cost, split by kind.</summary>
    ExpenseKindDto[] expenses_by_kind,
    /// <summary>Everything the work cost across the range.</summary>
    decimal expenses,
    /// <summary>What share of the tips the travelling ate, as a percentage.</summary>
    decimal? travel_share_of_tips,
    /// <summary>Income tax withheld across the range.</summary>
    decimal tax,
    /// <summary>total_earned minus tax — what actually reaches a pocket.</summary>
    decimal net_earned,
    /// <summary>Holiday pay accrued, owed later and never part of net.</summary>
    decimal holiday_accrued,
    /// <summary>Every currency the range touches.</summary>
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
    /// <summary>The share of the takings across the range, already inside shifts_earned.</summary>
    decimal revenue_earned,
    /// <summary>What those shifts took, where it was recorded.</summary>
    decimal revenue_counted,
    /// <summary>How many people were served across the range, where anybody counted.</summary>
    int guests_counted,
    /// <summary>Takings over guests, across the shifts that recorded both.</summary>
    decimal? average_cheque,
    /// <summary>Tips and hours by zone, for the zones anybody named.</summary>
    ZoneTotalDto[] by_zone,
    /// <summary>Everything overlapping the range, once each rather than repeated on every day it covers — a fortnight of…</summary>
    EventDto[] events,
    /// <summary>The range restated in one currency, present only where more than one was earned in.</summary>
    ConversionDto? conversion = null
    );

/// <summary>The same range in one currency, with the rates it was done at.</summary>
public record ConversionDto(
    string base_currency,
    decimal total_earned,
    decimal net_earned,
    ConvertedPlaceDto[] by_location,
    RateUsedDto[] rates,
    /// <summary>Currencies the bank had no rate for.</summary>
    string[] unconverted,
    /// <summary>What actually arrived, converted at the rate of the day each payment landed rather than at today's.</summary>
    decimal? paid = null);

public record ConvertedPlaceDto(
    int location_id,
    string name,
    string currency,
    decimal earned,
    /// <summary>Null where this currency could not be converted.</summary>
    decimal? converted);

/// <summary>One change of rate: when it happened, what it moved between, and what it has been worth since.</summary>
public record RaiseDto(
    int shift_id,
    string shift_name,
    string? location_name,
    DateOnly on,
    decimal before,
    decimal after,
    /// <summary>hour, day, week or month — the two rates are always in the same one.</summary>
    string period,
    /// <summary>What the change has come to since, against work actually done.</summary>
    decimal worth_since,
    int days_ago);

/// <summary>Expenses of one kind over a range: how much, and how many of them.</summary>
public record ExpenseKindDto(string kind, decimal amount, int count);

/// <summary>Fines of one kind over a range: how much, and how often.</summary>
public record DeductionReasonDto(string reason, decimal amount, int days);

/// <summary>One rate, and the day it was actually published on.</summary>
public record RateUsedDto(
    string code,
    /// <summary>The national bank's published rate — the basis of every figure above.</summary>
    string rate,
    string on,
    /// <summary>What a commercial bank will actually buy this currency for today, and the day it said so.</summary>
    string? market = null,
    string? market_on = null);

/// <summary>What the client sends when saving a day.</summary>
public record DaySaveDto(
    DayShiftSaveDto[]? shifts,
    DaySaleSaveDto[]? sales,
    decimal? tips,
    decimal? tips_cash,
    decimal? deductions,
    /// <summary>Absent means unsaid, which is what an older client sends.</summary>
    string? deduction_reason,
    string? note,
    /// <summary>"#RRGGBB", or null to clear it.</summary>
    string? colour = null,
    /// <summary>The day's pool before the split.</summary>
    decimal? tip_pool = null,
    /// <summary>The version this client loaded, echoed back.</summary>
    int? version = null
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
    decimal? revenue = null,
    /// <summary>How many people it served.</summary>
    int? guests = null,
    /// <summary>Where in the venue. Absent leaves whatever was there.</summary>
    string? zone = null
    );

/// <summary>One zone's share of the hours and the tips.</summary>
public record ZoneTotalDto(
    string zone,
    double hours,
    decimal tips,
    /// <summary>Tips per paid hour there — the figure the argument is about.</summary>
    decimal tips_per_hour,
    int shifts);

public record DaySaleSaveDto(
    int sales_id,
    int quantity
    );

/// <summary>Colours a stretch of days in one round trip.</summary>
public record BulkColourDto(
    /// <summary>Date to colour. Null clears whatever the day had.</summary>
    DayColourDto[] days
    );

public record DayColourDto(DateOnly date, string? colour);

/// <summary>Applies one template across many dates in a single round trip.</summary>
public record BulkShiftDto(
    DateOnly[] dates,
    int shift_id,
    /// <summary>"add" or "remove".</summary>
    string mode
    );
