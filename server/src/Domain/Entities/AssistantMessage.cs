namespace Shifter.Domain.Entities;

/// <summary>One turn of the conversation with the assistant.</summary>
public sealed class AssistantMessage
{
    public int Id { get; set; }

    public int UserId { get; set; }
    public User? User { get; set; }

    /// <summary>"user" or "assistant". Nothing else is ever written.</summary>
    public required string Role { get; set; }

    public required string Text { get; set; }

    /// <summary>"model" or "local" on an answer, null on a person's own message.</summary>
    public string? Source { get; set; }

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}
