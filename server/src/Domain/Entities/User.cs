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

    /// <summary>
    /// The rest between shifts this person counts as enough, in hours.
    ///
    /// Eleven is the EU daily rule and the default nobody has to choose. It is
    /// theirs to set because rest is theirs, not the employer's: somebody who
    /// works split doubles by arrangement should be able to stop being told
    /// about it, and somebody who wants a stricter line should get one.
    /// </summary>
    public double RestHours { get; set; } = RestBetweenShifts.DefaultHours;
    public List<Sales>? Sales {get; set;}
    
    /// <summary>
    /// The secret in the calendar-subscription URL. Null until the person
    /// turns the feed on; rotating it is how a leaked link is put down.
    /// </summary>
    public string? FeedToken { get; set; }

    /// <summary>
    /// The short code in this person's invite link. Minted on first use, so
    /// accounts that never invite anybody carry nothing extra.
    /// </summary>
    public string? ReferralCode { get; set; }

    /// <summary>Who brought them in; null for everyone who arrived on their own.</summary>
    public int? InvitedByUserId { get; set; }

    // ==== The record, if they choose to show it ====

    /// <summary>
    /// The unguessable half of a link to somebody's own work history: how long
    /// in the trade, where, how many shifts. Null until they ask for one, and
    /// null again the moment they turn it off — a link that stops working is
    /// the only revocation anybody believes.
    ///
    /// Off by default, and it stays off. A work history is not a thing to
    /// publish on somebody's behalf, however useful it would be to them.
    /// </summary>
    public string? CardSlug { get; set; }

    /// <summary>Whether the card names the places. Off unless asked for.</summary>
    public bool CardShowsPlaces { get; set; }

    /// <summary>Whether the card shows rates. Off unless asked for.</summary>
    public bool CardShowsMoney { get; set; }

    /// <summary>
    /// The address a lost password is recovered through. Optional and
    /// private: it is never shown to anyone else and never travels with a
    /// gig response — the contacts below do that job.
    /// </summary>
    public string? Email { get; set; }

    // ==== Reachability, shared only through an explicit gig response ====

    public string? ContactPhone { get; set; }
    public string? ContactTelegram { get; set; }

    // ==== The face on the profile ====

    /// <summary>"photo" | "preset" | "weave" | null (initials fallback).</summary>
    public string? AvatarKind { get; set; }

    /// <summary>
    /// photo: a small JPEG data URL (≤48KB after client-side crop);
    /// preset: "emoji|#colour"; weave: the seed the canvas is drawn from.
    /// </summary>
    public string? AvatarData { get; set; }

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