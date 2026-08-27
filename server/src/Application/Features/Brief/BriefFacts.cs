namespace Shifter.Application.Features.Brief;

/// <summary>
/// Everything the brief is allowed to know, already computed by us. The model
/// never counts: it is handed finished numbers and asked only to say them
/// like a person would. A model that does arithmetic writes beautiful lies
/// about somebody's wages.
/// </summary>
public sealed record BriefFacts(
    string Date,
    string Weekday,
    /// <summary>Today's shift, or null on a day off.</summary>
    string? ShiftName,
    string? ShiftFrom,
    string? ShiftTo,
    decimal MonthEarned,
    int MonthShifts,
    double MonthHours,
    decimal? Goal,
    /// <summary>0..1 of the goal, null when there is no goal.</summary>
    double? GoalProgress,
    decimal ProjectedMonth,
    int StreakDays,
    decimal BestDayAmount,
    string? BestDayDate,
    decimal TipsShare,
    /// <summary>Days until the next payday, null when nothing is scheduled.</summary>
    int? DaysToPayday,
    decimal? PaydayAmount,
    string[] Highlights);
