using System.ComponentModel.DataAnnotations;

namespace Shifter.Domain.Entities;

public sealed class JwtToken
{
    [Key]
    public int Id { get; set; }
    public required int UserId { get; set; }

    /// <summary>Hash of the value handed to the client; the raw token is never stored.</summary>
    public required string Token { get; set; }

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime ExpiresAt { get; set; } = DateTime.UtcNow.AddDays(7);

    /// <summary>
    /// Set when the token is spent by a refresh, or when the user signs out.
    /// Rotation marks rather than deletes so that a second use of the same
    /// token is recognisable as a replay instead of looking like a typo.
    /// </summary>
    public DateTime? RevokedAt { get; set; }

    public bool IsActive(DateTime now) => RevokedAt is null && ExpiresAt > now;

    public void Revoke(DateTime now) => RevokedAt ??= now;
}
