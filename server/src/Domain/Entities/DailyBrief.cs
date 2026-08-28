namespace Shifter.Domain.Entities;

/// <summary>
/// One person's brief for one day. Stored rather than recomputed so the page
/// is instant, the model is asked at most once a day, and the words do not
/// change under the reader between two glances at the same morning.
/// </summary>
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

    /// <summary>
    /// Which language it was written in.
    ///
    /// Part of the key, not a label: a brief is cached for the day, so without
    /// this a Russian paragraph would be served to a Ukrainian request until
    /// tomorrow — the worst kind of bug, because it looks exactly like the
    /// feature not working.
    /// </summary>
    public string Language { get; set; } = "ru";

    /// <summary>
    /// The month's earnings at the moment these words were written. Stored so
    /// a brief that quotes a total can notice the total has moved: cached
    /// prose about money is only cheap until it starts contradicting the
    /// figures on the same screen.
    /// </summary>
    public decimal EarnedAtWriting { get; set; }

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}
