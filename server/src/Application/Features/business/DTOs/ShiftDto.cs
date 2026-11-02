namespace Shifter.Application.Features.business.DTOs;

/// <summary>A shift template as it goes out to the palette.</summary>
public record ShiftDto(
    int id,
    string name,
    string? symbol,
    string start_time,
    string end_time,
    string salary_period,
    decimal? salary_amount,
    /// <summary>A share of the shift's takings, paid on top of the rate.</summary>
    decimal? revenue_percent,
    /// <summary>"personal" or "pool".</summary>
    string tip_source,
    /// <summary>This person's slice of the pool, where the tips are pooled.</summary>
    decimal? tip_pool_percent,
    /// <summary>Unpaid minutes inside the shift; already taken off hours.</summary>
    int break_minutes,
    double hours,
    int? location_id,
    string? location_name,
    string? location_colour,
    /// <summary>The template's own colour, or null when it borrows the place's.</summary>
    string? colour,
    /// <summary>What the calendar should actually draw: own colour, else the place's.</summary>
    string? effective_colour,
    /// <summary>Whether a day with this shift paints itself in its colour.</summary>
    bool paints_day,
    bool archived,
    /// <summary>Weekdays that run other hours than the template's own; empty when none do.</summary>
    WeekHoursDto[] week_hours,
    /// <summary>Whether its shifts open and close themselves by the schedule.</summary>
    bool auto_clock
    );

/// <summary>One weekday's own hours. Monday is 1, Sunday is 7; times are "HH:mm".</summary>
public record WeekHoursDto(int weekday, string start_time, string end_time);

/// <summary>Create and update take the same fields. Times are "HH:mm".</summary>
public record ShiftCreateDto(
    string name,
    string? symbol,
    int? location_id,
    string start_time,
    string end_time,
    string salary_period,
    decimal? salary_amount,
    int break_minutes,
    /// <summary>"#RRGGBB", or null to go back to borrowing the place's colour.</summary>
    string? colour = null,
    /// <summary>A share of the takings on top of the rate.</summary>
    decimal? revenue_percent = null,
    /// <summary>"personal" or "pool"; anything else reads as personal.</summary>
    string? tip_source = null,
    decimal? tip_pool_percent = null,
    /// <summary>Whether days carrying this shift take its colour.</summary>
    bool paints_day = false,
    /// <summary>Null leaves them as they are, which is what an older client sends; empty clears them.</summary>
    WeekHoursDto[]? week_hours = null,
    /// <summary>Null leaves it as it is; a new template starts with it on.</summary>
    bool? auto_clock = null
    );
