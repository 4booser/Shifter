namespace Shifter.Application.Features.business.DTOs;

/// <summary>One place somebody has worked, as a line of a CV.</summary>
public record WorkHistoryPlaceDto(
    string name,
    /// <summary>yyyy-MM.</summary>
    string from,
    string to,
    int shifts,
    double hours,
    /// <summary>Null unless the person asked for money to be shown.</summary>
    decimal? per_hour,
    string currency);

/// <summary>One month of the record, the way a payroll clerk reads it: how many days were actually stood, how many hours…</summary>
public record WorkHistoryMonthDto(
    /// <summary>yyyy-MM.</summary>
    string month,
    /// <summary>Calendar days with at least one worked shift on them.</summary>
    int days,
    /// <summary>Shifts, which a double day makes more numerous than days.</summary>
    int shifts,
    double hours,
    /// <summary>Null unless the person asked for money to be shown.</summary>
    decimal? earned,
    decimal? per_hour);

/// <summary>A biography made of shifts.</summary>
public record WorkHistoryDto(
    int shifts,
    double hours,
    /// <summary>Months from the first recorded shift to the last, both ends counted.</summary>
    int months,
    /// <summary>yyyy-MM, or null where nothing has been recorded.</summary>
    string? first_month,
    string? last_month,
    WorkHistoryPlaceDto[] places,
    /// <summary>The shift names worked most — the nearest thing here to a job title.</summary>
    string[] roles,
    /// <summary>Month by month, newest first — the part an accountant asks for.</summary>
    WorkHistoryMonthDto[] by_month);
