using Shifter.Application.Features.business.DTOs;
using Shifter.Domain.Entities;

namespace Shifter.Application.Features.Rosters;

/// <summary>Where somebody's usual hours come from. A position is "none", "own" or "venue"; a person is "inherit" or "own". Times are "HH:mm" and set only for "own", whose week_hours are the weekdays that run other hours.</summary>
public record RosterHoursDto(string? mode, string? start_time, string? end_time, WeekHoursDto[]? week_hours);

/// <summary>The days somebody usually works: "none", "weekdays" (ISO, ascending), or "cycle", on days and off days in step with from, a "yyyy-MM-dd" the rhythm runs both ways from.</summary>
public record RosterPatternDto(string? kind, int[]? weekdays, int? on, int? off, string? from);

public record RosterPositionDto(int id, string name, RosterHoursDto hours);

/// <summary>A person as the owner's screens read them. Position is the linked position's name, kept for older clients and for display.</summary>
public record RosterPersonDto(
    int id,
    string name,
    int? position_id,
    string? position,
    string colour,
    RosterHoursDto hours,
    RosterPatternDto pattern);

/// <summary>One roster in the owner's list. People travel as they do on the month, so a client reads one shape.</summary>
public record RosterDto(
    int id,
    string title,
    string? share_slug,
    WeekHoursDto[] venue_hours,
    RosterPositionDto[] positions,
    RosterPersonDto[] people);

public record RosterSaveDto(string? title);

/// <summary>A body carrying hours or pattern is a new client's, which names the position by id alone; one with neither is an older client's, which names it in words.</summary>
public record RosterPersonSaveDto(
    string? name,
    string? position,
    string? colour,
    int? position_id = null,
    RosterHoursDto? hours = null,
    RosterPatternDto? pattern = null);

/// <summary>The person as saved, and how many of their shifts to come moved with their usual hours.</summary>
public record RosterPersonSavedDto(
    int id,
    string name,
    int? position_id,
    string? position,
    string colour,
    RosterHoursDto hours,
    RosterPatternDto pattern,
    int restamped);

/// <summary>One filled cell. Times are "HH:mm", both or neither: neither is a day worked at no set time. A shift running past midnight is held on its start date.</summary>
public record RosterShiftDto(int person_id, string date, string? start_time, string? end_time);

public record RosterMonthDto(
    int id,
    string title,
    string? share_slug,
    string month,
    WeekHoursDto[] venue_hours,
    RosterPositionDto[] positions,
    RosterPersonDto[] people,
    RosterShiftDto[] shifts);

/// <summary>The venue's open weekdays, the whole list at once. Empty is not set.</summary>
public record RosterVenueSaveDto(WeekHoursDto[]? venue_hours);

public record RosterVenueSavedDto(WeekHoursDto[] venue_hours, int restamped);

/// <summary>Null hours are none on a new position and left as they are on one already there.</summary>
public record RosterPositionSaveDto(string? name, RosterHoursDto? hours);

public record RosterPositionSavedDto(int id, string name, RosterHoursDto hours, int restamped);

/// <summary>Shifts to come that sat at somebody's old usual hours and were moved to the new ones.</summary>
public record RosterRestampedDto(int restamped);

public record RosterCellSetDto(int person_id, string? date, string? start_time, string? end_time);

public record RosterCellClearDto(int person_id, string? date);

/// <summary>A batch of edits, all of it or none. A cell named twice ends as the last entry says, and clear is read after set.</summary>
public record RosterCellsDto(RosterCellSetDto?[]? set, RosterCellClearDto?[]? clear);

public record RosterRepeatDto(string? month);

/// <summary>Cells filled, and cells that already held a shift and were left alone.</summary>
public record RosterRepeatedDto(int added, int kept);

/// <summary>The body of both fill and clear.</summary>
public record RosterFillDto(string? month);

/// <summary>Usual days put on, usual days already filled and left alone, and empty usual days skipped because the venue is closed, all from the date the fill started.</summary>
public record RosterFilledDto(int added, int kept, int skipped, string from);

public record RosterClearedDto(int cleared, string from);

public record RosterShareDto(string share_slug);

/// <summary>A cell as the batch settled it: empty, filled with hours, or filled with none.</summary>
public readonly record struct RosterCell(int PersonId, DateOnly Date, bool Filled, TimeOnly? Start, TimeOnly? End);

/// <summary>Everything that decides people's usual hours, as it stood before a save or stands after it.</summary>
public sealed record RosterDefaults(
    IReadOnlyCollection<WeekdayHours> Venue,
    IReadOnlyCollection<RosterPosition> Positions,
    IReadOnlyList<RosterPerson> People);

/// <summary>On this person's days of this weekday, a timed shift still at the old hours takes the new ones. Null new hours are no set time.</summary>
public readonly record struct RosterRestamp(
    int PersonId, int Weekday, TimeOnly OldStart, TimeOnly OldEnd, TimeOnly? NewStart, TimeOnly? NewEnd);

/// <summary>What a fill puts on, ordered by date and then person; the rows carry no roster, which the service sets.</summary>
public sealed record RosterFillPlan(RosterShift[] Add, int Kept, int Skipped);

/// <summary>People under one position, in display order. A null position is the people with none, always last.</summary>
public sealed record RosterGroup(RosterPosition? Position, RosterPerson[] People);

/// <summary>Everything a link may show. No id and no owner, so neither can reach the page. Today is the date on the owner's clock, which gives away nothing else about them.</summary>
public sealed record RosterPageRead(
    string Title, DateOnly Month, DateOnly Today, WeekdayHours[] Venue, RosterPageGroup[] Groups);

/// <summary>People under one position, in the order the owner's screen shows them. A null name is the people with no position, always last.</summary>
public sealed record RosterPageGroup(string? Position, RosterPagePerson[] People);

public sealed record RosterPagePerson(string Name, string Colour, RosterPageShift[] Shifts);

/// <summary>Null hours are a day worked at no set time.</summary>
public readonly record struct RosterPageShift(DateOnly Date, TimeOnly? Start, TimeOnly? End);
