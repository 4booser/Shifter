using System.ComponentModel.DataAnnotations;

namespace Shifter.Domain.Entities;

public sealed class User
{
    [Key]
    public int Id { get; set; }
    
    public required string FirstName { get; set; }
    public string? LastName { get; set; }
    
    public required string Login { get; set; }
    /// <summary>
    /// Null for accounts that only ever signed in with Google — there is no
    /// password to hash, and inventing one would be a lie about how they log in.
    /// </summary>
    public string? PasswordHash { get; set; }

    /// <summary>Google's stable user id ("sub"), unique when present.</summary>
    public string? GoogleSubject { get; set; }
    
    public List<Day>? CalendarDays { get; set; }

    /// <summary>Income the user aims for in a month; null means no goal set.</summary>
    public decimal? MonthlyGoal { get; set; }
    public List<Sales>? Sales {get; set;}
    
    /// <summary>
    /// The secret in the calendar-subscription URL. Null until the person
    /// turns the feed on; rotating it is how a leaked link is put down.
    /// </summary>
    public string? FeedToken { get; set; }

    /// <summary>
    /// The TOTP secret. Set at setup, meaningful only once
    /// <see cref="TotpEnabledAt"/> confirms the person proved they hold it.
    /// </summary>
    public string? TotpSecret { get; set; }

    public DateTime? TotpEnabledAt { get; set; }

    /// <summary>SHA-256 hashes of the unused backup codes, ';'-joined.</summary>
    public string? BackupCodeHashes { get; set; }

    public bool IsActive { get; set; } = true;
    public DateTime CreatedAt { get; set; }
    public DateTime? LastLogin { get; set; }
}