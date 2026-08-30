namespace Shifter.Application.Features.Assistant;

/// <summary>
/// The period, already counted. Like the brief's facts, this exists so the
/// model never does arithmetic: it is handed finished figures and asked only
/// to say them like a person would. A model that adds up wages writes
/// beautiful lies about somebody's month.
/// </summary>
public sealed record AssistantFacts(
    string From,
    string To,
    /// <summary>"месяц", "неделя", "год" or a plain range — how to name it.</summary>
    string Period,
    decimal Earned,
    decimal Planned,
    decimal Net,
    decimal Tax,
    int Shifts,
    double Hours,
    decimal PerHour,
    decimal ShiftsEarned,
    decimal RevenueEarned,
    decimal RevenueCounted,
    decimal TipsEarned,
    decimal SalesEarned,
    decimal PeriodEarned,
    decimal OvertimeEarned,
    decimal PremiumEarned,
    decimal TipOut,
    decimal Deductions,
    double OvertimeHours,
    double NightHours,
    decimal BestDayAmount,
    string? BestDayDate,
    string? BusiestWeekday,
    /// <summary>The weekday whose worked days average the most tips.</summary>
    string? BestTipWeekday,
    decimal BestTipAverage,
    decimal LongestShiftHours,
    int DaysOff,
    /// <summary>Place, hours and money — only where a place is set.</summary>
    AssistantPlace[] Places,
    /// <summary>The previous period of the same length, for "more or less than".</summary>
    decimal PreviousEarned,
    string[] Currencies,
    /// <summary>Days until money lands, through the same rule the payouts page uses. Null when nothing is owed.</summary>
    int? DaysToPayday = null,
    decimal? PaydayAmount = null);

public sealed record AssistantPlace(
    string Name,
    double Hours,
    decimal Earned,
    /// <summary>
    /// What this place pays in. Carried so a list of places never prints one
    /// currency's amount with another's mark, which is the same lie as adding
    /// them together, said one level quieter.
    /// </summary>
    string Currency);
