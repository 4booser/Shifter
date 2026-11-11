namespace Shifter.Application.Features.Rosters;

public record RosterPersonDto(int id, string name, string? position, string colour);

/// <summary>One roster in the owner's list. People travel as they do on the month, so a client reads one shape.</summary>
public record RosterDto(int id, string title, string? share_slug, RosterPersonDto[] people);

public record RosterSaveDto(string? title);

public record RosterPersonSaveDto(string? name, string? position, string? colour);

/// <summary>One filled cell. Times are "HH:mm"; a shift running past midnight is held on its start date.</summary>
public record RosterShiftDto(int person_id, string date, string start_time, string end_time);

public record RosterMonthDto(
    int id,
    string title,
    string? share_slug,
    string month,
    RosterPersonDto[] people,
    RosterShiftDto[] shifts);

public record RosterCellSetDto(int person_id, string? date, string? start_time, string? end_time);

public record RosterCellClearDto(int person_id, string? date);

/// <summary>A batch of edits, all of it or none. A cell named twice ends as the last entry says, and clear is read after set.</summary>
public record RosterCellsDto(RosterCellSetDto?[]? set, RosterCellClearDto?[]? clear);

public record RosterRepeatDto(string? month);

/// <summary>Cells filled, and cells that already held a shift and were left alone.</summary>
public record RosterRepeatedDto(int added, int kept);

public record RosterShareDto(string share_slug);

/// <summary>A cell as the batch settled it. A null start means the cell ends up empty.</summary>
public readonly record struct RosterCell(int PersonId, DateOnly Date, TimeOnly? Start, TimeOnly? End);

/// <summary>Everything a link may show. No id and no owner, so neither can reach the page. Today is the date on the owner's clock, which gives away nothing else about them.</summary>
public sealed record RosterPageRead(string Title, DateOnly Month, DateOnly Today, RosterPagePerson[] People);

public sealed record RosterPagePerson(string Name, string? Position, string Colour, RosterPageShift[] Shifts);

public readonly record struct RosterPageShift(DateOnly Date, TimeOnly Start, TimeOnly End);
