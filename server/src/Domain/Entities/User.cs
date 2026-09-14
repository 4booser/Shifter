using System.ComponentModel.DataAnnotations;

namespace Shifter.Domain.Entities;

public sealed class User
{
    [Key]
    public int Id { get; set; }
    
    public required string FirstName { get; set; }
    public string? LastName { get; set; }
    
    public required string Login { get; set; }
    /// <summary>Null for accounts that only ever signed in with Google — there is no password to hash, and inventing one…</summary>
    public string? PasswordHash { get; set; }

    /// <summary>Google's stable user id ("sub"), unique when present.</summary>
    public string? GoogleSubject { get; set; }
    
    public List<Day>? CalendarDays { get; set; }

    /// <summary>Income the user aims for in a month; null means no goal set.</summary>
    public decimal? MonthlyGoal { get; set; }

    /// <summary>The rest between shifts this person counts as enough, in hours.</summary>
    public double RestHours { get; set; } = RestBetweenShifts.DefaultHours;

    /// <summary>Colours this person saved to reuse, as a JSON array of "#RRGGBB".</summary>
    public string ColourPresets { get; set; } = "[]";

    /// <summary>A share of tips to put aside, as a percent.</summary>
    public decimal TipSavePercent { get; set; }

    /// <summary>What the saving is for. Zero means no target, only a total.</summary>
    public decimal TipSaveGoal { get; set; }

    /// <summary>When the rule started.</summary>
    public DateOnly? TipSaveFrom { get; set; }
    public List<Sales>? Sales {get; set;}
    
    /// <summary>The secret in the calendar-subscription URL.</summary>
    public string? FeedToken { get; set; }

    /// <summary>The short code in this person's invite link.</summary>
    public string? ReferralCode { get; set; }

    /// <summary>Who brought them in; null for everyone who arrived on their own.</summary>
    public int? InvitedByUserId { get; set; }

    // ==== The record, if they choose to show it ====

    /// <summary>The unguessable half of a link to somebody's own work history: how long in the trade, where, how many shifts.</summary>
    public string? CardSlug { get; set; }

    /// <summary>Whether the card names the places. Off unless asked for.</summary>
    public bool CardShowsPlaces { get; set; }

    /// <summary>Whether the card shows rates. Off unless asked for.</summary>
    public bool CardShowsMoney { get; set; }

    /// <summary>The address a lost password is recovered through.</summary>
    public string? Email { get; set; }

    /// <summary>Whether they asked for the month's letter.</summary>
    public bool MonthlyLetter { get; set; }

    /// <summary>The last month a letter went out for, as "2026-08".</summary>
    public string? MonthlyLetterSent { get; set; }

    /// <summary>The half of the unsubscribe link that cannot be guessed.</summary>
    public string? LetterKey { get; set; }

    // ==== Reachability, shared only through an explicit gig response ====

    public string? ContactPhone { get; set; }
    public string? ContactTelegram { get; set; }

    // ==== The face on the profile ====

    /// <summary>"photo" | "preset" | "weave" | null (initials fallback).</summary>
    public string? AvatarKind { get; set; }

    /// <summary>photo: a small JPEG data URL (≤48KB after client-side crop); preset: "emoji|#colour"; weave: the seed the…</summary>
    public string? AvatarData { get; set; }

    /// <summary>The TOTP secret.</summary>
    public string? TotpSecret { get; set; }

    public DateTime? TotpEnabledAt { get; set; }

    /// <summary>SHA-256 hashes of the unused backup codes, ';'-joined.</summary>
    public string? BackupCodeHashes { get; set; }

    public bool IsActive { get; set; } = true;

    /// <summary>When this account stops being a demonstration and starts being rubbish.</summary>
    public DateTime? DemoUntil { get; set; }

    public DateTime CreatedAt { get; set; }
    public DateTime? LastLogin { get; set; }
}