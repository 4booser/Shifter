namespace Shifter.Domain.Entities;

/// <summary>One person's brief for one day.</summary>
public sealed class DailyBrief
{
    public int Id { get; set; }

    public int UserId { get; set; }
    public User? User { get; set; }

    public required DateOnly Date { get; set; }

    public required string Headline { get; set; }
    public required string Body { get; set; }
    public string? Tip { get; set; }
    public string? Mood { get; set; }

    /// <summary>"model" or "local" — shown to the reader, never hidden.</summary>
    public required string Source { get; set; }

    /// <summary>Which language it was written in.</summary>
    public string Language { get; set; } = "ru";

    /// <summary>The month's earnings at the moment these words were written.</summary>
    public decimal EarnedAtWriting { get; set; }

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}
