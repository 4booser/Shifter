namespace Shifter.Domain.Entities;

/// <summary>A month one person writes for a whole crew: names rather than accounts, read at a link by people who never signed up.</summary>
public sealed class Roster
{
    public const int TitleMax = 60;
    public const int SlugLength = 12;
    public const int MaxPerOwner = 20;
    public const int MaxPeople = 60;

    public int Id { get; set; }

    public int UserId { get; set; }
    public User? User { get; set; }

    public required string Title { get; set; }

    /// <summary>The half of the link that cannot be guessed. Null is the link switched off.</summary>
    public string? ShareSlug { get; set; }

    public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAtUtc { get; set; } = DateTime.UtcNow;

    public List<RosterPerson>? People { get; set; }
}

/// <summary>A name on a roster and nothing more: no account stands behind it.</summary>
public sealed class RosterPerson
{
    public const int NameMax = 40;
    public const int PositionMax = 40;

    public int Id { get; set; }

    public int RosterId { get; set; }
    public Roster? Roster { get; set; }

    public required string Name { get; set; }

    /// <summary>Free text in the owner's words: "Кальяны", "Бар", "Админ".</summary>
    public string? Position { get; set; }

    /// <summary>Lower-case #rrggbb, because a page a stranger opens writes it into a style attribute.</summary>
    public required string Colour { get; set; }
}

/// <summary>One person's hours on one day. An end at or before the start runs into the next day and belongs to its start date.</summary>
public sealed class RosterShift
{
    public int Id { get; set; }

    public int RosterId { get; set; }
    public Roster? Roster { get; set; }

    public int RosterPersonId { get; set; }
    public RosterPerson? Person { get; set; }

    public DateOnly Date { get; set; }
    public TimeOnly StartTime { get; set; }
    public TimeOnly EndTime { get; set; }
}
