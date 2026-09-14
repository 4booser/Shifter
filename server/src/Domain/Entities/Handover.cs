namespace Shifter.Domain.Entities;

/// <summary>What the shift going home knows and the shift coming in does not.</summary>
public sealed class Handover
{
    public const int TextMax = 1000;

    public int Id { get; set; }

    public int TeamId { get; set; }
    public Team? Team { get; set; }

    public required DateOnly Date { get; set; }

    public string Text { get; set; } = string.Empty;

    /// <summary>Who wrote it last.</summary>
    public int? UpdatedByUserId { get; set; }
    public User? UpdatedBy { get; set; }

    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
}

/// <summary>Something the room does not have, or something that is broken.</summary>
public sealed class StopItem
{
    public const int NameMax = 80;

    public int Id { get; set; }

    public int TeamId { get; set; }
    public Team? Team { get; set; }

    /// <summary>"stop" for something that ran out, "broken" for equipment.</summary>
    public string Kind { get; set; } = "stop";

    public required string Name { get; set; }

    /// <summary>Who raised it.</summary>
    public int? RaisedByUserId { get; set; }
    public User? RaisedBy { get; set; }

    public DateTime RaisedAt { get; set; } = DateTime.UtcNow;

    /// <summary>Set when it comes back. The row stays: how often it runs out is worth knowing.</summary>
    public DateTime? ClearedAt { get; set; }
    public int? ClearedByUserId { get; set; }
    public User? ClearedBy { get; set; }
}
