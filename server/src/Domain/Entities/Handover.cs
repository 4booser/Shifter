namespace Shifter.Domain.Entities;

/// <summary>
/// What the shift going home knows and the shift coming in does not.
///
/// The kitchen ran out of the burrata at eight, the coffee grinder makes a
/// noise, there is a table of twenty at nine tomorrow. All of it currently
/// reaches the next shift through a guest, half an hour in. It is written at
/// the end of a shift and read at the start of the next one, which is why it is
/// one note per crew per day rather than a conversation: a chat scrolls, and a
/// handover has to be the thing you read once and act on.
/// </summary>
public sealed class Handover
{
    public const int TextMax = 1000;

    public int Id { get; set; }

    public int TeamId { get; set; }
    public Team? Team { get; set; }

    public required DateOnly Date { get; set; }

    public string Text { get; set; } = string.Empty;

    /// <summary>
    /// Who wrote it last. A handover with no name on it is a rumour — but a
    /// person leaving must not delete what they told the crew, so the name is
    /// forgotten rather than the note.
    /// </summary>
    public int? UpdatedByUserId { get; set; }
    public User? UpdatedBy { get; set; }

    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
}

/// <summary>
/// Something the room does not have, or something that is broken.
///
/// Deliberately not attached to a day. "Мартини закончился" is true until
/// somebody says it is not, and a list that resets at midnight is a list nobody
/// trusts. It carries the day it was raised so the length of the problem is
/// visible — a grinder broken for three weeks is a different conversation from
/// one broken this morning.
/// </summary>
public sealed class StopItem
{
    public const int NameMax = 80;

    public int Id { get; set; }

    public int TeamId { get; set; }
    public Team? Team { get; set; }

    /// <summary>"stop" for something that ran out, "broken" for equipment.</summary>
    public string Kind { get; set; } = "stop";

    public required string Name { get; set; }

    /// <summary>
    /// Who raised it. Nullable for the same reason the handover's author is:
    /// somebody leaving should not take the fact that the grinder is broken
    /// with them.
    /// </summary>
    public int? RaisedByUserId { get; set; }
    public User? RaisedBy { get; set; }

    public DateTime RaisedAt { get; set; } = DateTime.UtcNow;

    /// <summary>Set when it comes back. The row stays: how often it runs out is worth knowing.</summary>
    public DateTime? ClearedAt { get; set; }
    public int? ClearedByUserId { get; set; }
    public User? ClearedBy { get; set; }
}
