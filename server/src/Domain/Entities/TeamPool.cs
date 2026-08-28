namespace Shifter.Domain.Entities;

/// <summary>
/// The night's tip pool, entered once for the whole crew.
///
/// The share is already on each person's shift template, and each of them
/// currently types the pool in themselves — so by the morning five people have
/// five slightly different numbers and an argument nobody can settle, because
/// there is nothing to settle it against.
///
/// One number, entered by whoever counted it, and everybody's share falls out
/// of it. Who got what is visible to everyone who worked that shift: that is
/// not a hole in the privacy rules, it is the exact transparency a pool exists
/// for. A pool nobody can check is just a promise.
/// </summary>
public sealed class TeamPool
{
    public int Id { get; set; }

    public int TeamId { get; set; }
    public Team? Team { get; set; }

    public required DateOnly Date { get; set; }

    /// <summary>What the room took, before it is split.</summary>
    public decimal Amount { get; set; }

    /// <summary>
    /// Who counted it. Nullable so a person leaving does not take the night's
    /// figure with them — the money was still counted, whoever did it.
    /// </summary>
    public int? EnteredByUserId { get; set; }
    public User? EnteredBy { get; set; }

    public DateTime EnteredAt { get; set; } = DateTime.UtcNow;
}
