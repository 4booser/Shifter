namespace Shifter.Domain.Entities;

/// <summary>A month one person writes for a whole crew: names rather than accounts, read at a link by people who never signed up.</summary>
public sealed class Roster
{
    public const int TitleMax = 60;
    public const int SlugLength = 12;
    public const int MaxPerOwner = 20;
    public const int MaxPeople = 60;
    public const int MaxPositions = 20;

    public int Id { get; set; }

    public int UserId { get; set; }
    public User? User { get; set; }

    public required string Title { get; set; }

    /// <summary>The half of the link that cannot be guessed. Null is the link switched off.</summary>
    public string? ShareSlug { get; set; }

    public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAtUtc { get; set; } = DateTime.UtcNow;

    /// <summary>The days the venue opens and its hours on each. Empty is "not said": no day is closed and nobody's time comes from it. A weekday missing from a list that has any is a day the venue is closed.</summary>
    public List<WeekdayHours> VenueHours { get; set; } = [];

    public List<RosterPerson>? People { get; set; }

    public List<RosterPosition>? Positions { get; set; }
}

/// <summary>A job on one roster, "Бармен" or "Кальянщик", and the hours it usually runs, so nobody's time is typed day by day.</summary>
public sealed class RosterPosition
{
    public const int NameMax = 40;

    public int Id { get; set; }

    public int RosterId { get; set; }
    public Roster? Roster { get; set; }

    /// <summary>Trimmed; unique on its roster ignoring case.</summary>
    public required string Name { get; set; }

    public RosterHoursMode HoursMode { get; set; } = RosterHoursMode.None;

    /// <summary>Set exactly when the mode is Own; an end at or before the start runs past midnight.</summary>
    public TimeOnly? StartTime { get; set; }
    public TimeOnly? EndTime { get; set; }

    /// <summary>Weekdays that run other hours than the two above. Empty unless the mode is Own.</summary>
    public List<WeekdayHours> WeekHours { get; set; } = [];
}

/// <summary>Where a position's hours come from. Zero is no set time, which is what a new position and a converted one take: opening hours are not when the staff come in.</summary>
public enum RosterHoursMode
{
    None = 0,
    Own = 1,
    Venue = 2,
}

/// <summary>A name on a roster and nothing more: no account stands behind it.</summary>
public sealed class RosterPerson
{
    public const int NameMax = 40;
    public const int PositionMax = 40;
    public const int CycleMax = 28;

    public int Id { get; set; }

    public int RosterId { get; set; }
    public Roster? Roster { get; set; }

    public required string Name { get; set; }

    /// <summary>The position's name as the release before positions read it. Written whenever the link changes or the position is renamed, never read: it is there for a rollback and for the old release serving while this one deploys.</summary>
    public string? Position { get; set; }

    /// <summary>Lower-case #rrggbb, because a page a stranger opens writes it into a style attribute.</summary>
    public required string Colour { get; set; }

    /// <summary>Their job on this roster, if any. Deleting the position keeps the person and drops the link.</summary>
    public int? RosterPositionId { get; set; }
    public RosterPosition? RosterPosition { get; set; }

    /// <summary>Their own usual hours, over their position's. Both null is none of their own.</summary>
    public TimeOnly? StartTime { get; set; }
    public TimeOnly? EndTime { get; set; }

    /// <summary>Weekdays of their own that run other hours. Empty unless they have hours of their own.</summary>
    public List<WeekdayHours> WeekHours { get; set; } = [];

    /// <summary>The weekdays they usually work, ISO and ascending. Null unless their usual days go by the week.</summary>
    public int[]? PatternWeekdays { get; set; }

    /// <summary>A cycle of days on and days off, in step with a day it starts on: the rhythm runs before that day as well as after. All three or none.</summary>
    public int? CycleOn { get; set; }
    public int? CycleOff { get; set; }
    public DateOnly? CycleFrom { get; set; }
}

/// <summary>One person on one day, with hours or without. No hours is a day they work at no set time; an end at or before the start runs into the next day and belongs to its start date.</summary>
public sealed class RosterShift
{
    public int Id { get; set; }

    public int RosterId { get; set; }
    public Roster? Roster { get; set; }

    public int RosterPersonId { get; set; }
    public RosterPerson? Person { get; set; }

    public DateOnly Date { get; set; }
    public TimeOnly? StartTime { get; set; }
    public TimeOnly? EndTime { get; set; }
}
