namespace Shifter.Domain.Entities;

/// <summary>
/// One turn of the conversation with the assistant. Kept rather than
/// recomputed because a person asking "what did I say last week" is asking
/// about the thread, not about their shifts — and because an answer that
/// changes between two readings of the same question is worse than no answer.
/// </summary>
public sealed class AssistantMessage
{
    public int Id { get; set; }

    public int UserId { get; set; }
    public User? User { get; set; }

    /// <summary>"user" or "assistant". Nothing else is ever written.</summary>
    public required string Role { get; set; }

    public required string Text { get; set; }

    /// <summary>
    /// "model" or "local" on an answer, null on a person's own message. Shown
    /// to the reader: an answer written by arithmetic and one dressed by a
    /// model deserve different amounts of trust, and hiding which is which
    /// spends trust the feature has not earned.
    /// </summary>
    public string? Source { get; set; }

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}
