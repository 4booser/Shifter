namespace Shifter.Domain.Entities;

/// <summary>
/// One password-reset ticket: a hash of the emailed secret, an hour to live,
/// and a stamp of the moment it was spent. Only the hash is stored, so a
/// database read cannot reset anybody's password.
/// </summary>
public sealed class PasswordReset
{
    public int Id { get; set; }

    public int UserId { get; set; }
    public User? User { get; set; }

    /// <summary>SHA-256 of the token that went out in the letter.</summary>
    public required string TokenHash { get; set; }

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime ExpiresAt { get; set; } = DateTime.UtcNow.AddHours(1);
    public DateTime? UsedAt { get; set; }
}
