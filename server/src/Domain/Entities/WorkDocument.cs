namespace Shifter.Domain.Entities;

/// <summary>A piece of paper without which somebody is not allowed on shift.</summary>
public sealed class WorkDocument
{
    public const int NameMax = 80;
    public const int NoteMax = 200;

    public int Id { get; set; }

    public int UserId { get; set; }
    public User? User { get; set; }

    /// <summary>What it is: "medical" (медкнижка), "sanitary" (санминимум), "certificate" (курсы, бармен-сертификат)…</summary>
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
