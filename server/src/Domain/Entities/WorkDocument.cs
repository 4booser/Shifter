namespace Shifter.Domain.Entities;

/// <summary>
/// A piece of paper without which somebody is not allowed on shift.
///
/// In Ukrainian hospitality an expired медкнижка is not a fine — it is being
/// turned away at the door of a shift you were counting on. People remember it
/// on the day it is needed, which is the one day it cannot be fixed. The app
/// already knows when every shift is; knowing when the paper runs out costs one
/// date and buys a month's warning.
///
/// Deliberately a date and a name, and nothing else. A photograph of somebody's
/// medical book is exactly the kind of thing that should not sit on a server:
/// the reminder needs the expiry, and the document itself belongs in a pocket.
/// </summary>
public sealed class WorkDocument
{
    public const int NameMax = 80;
    public const int NoteMax = 200;

    public int Id { get; set; }

    public int UserId { get; set; }
    public User? User { get; set; }

    /// <summary>
    /// What it is: "medical" (медкнижка), "sanitary" (санминимум),
    /// "certificate" (курсы, бармен-сертификат), "licence" (права),
    /// "permit" (разрешение на работу), "other".
    /// </summary>
    public string Kind { get; set; } = "other";

    /// <summary>What it is called, in the person's own words.</summary>
    public required string Name { get; set; }

    /// <summary>The day after which it stops counting.</summary>
    public required DateOnly ExpiresOn { get; set; }

    /// <summary>Where it was issued, or a number — whatever helps renew it.</summary>
    public string? Note { get; set; }

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    /// <summary>Days left, which is the only thing anybody actually asks.</summary>
    public int DaysLeft(DateOnly today) => ExpiresOn.DayNumber - today.DayNumber;
}
