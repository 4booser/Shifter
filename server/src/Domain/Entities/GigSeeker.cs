namespace Shifter.Domain.Entities;

/// <summary>
/// The other side of the board: a person saying "I am looking". One card
/// per account, switchable off. Contact channels live here only because
/// the person typed them in — publishing the card IS the consent.
/// </summary>
public sealed class GigSeeker
{
    public const int AboutMax = 300;
    public const int AvailabilityMax = 120;

    public int Id { get; set; }

    public int UserId { get; set; }
    public User? User { get; set; }

    /// <summary>What kind of work: freelance covers, a permanent seat, or either.</summary>
    public GigEmployment? Employment { get; set; }

    /// <summary>Up to three wire names, comma-joined: "bartender,barback".</summary>
    public required string CategoriesCsv { get; set; }

    public required string City { get; set; }

    public string? About { get; set; }

    /// <summary>"пт–вс вечера", in the person's words.</summary>
    public string? Availability { get; set; }

    /// <summary>The rate they name, optional; period is "hour"|"shift"|"month".</summary>
    public decimal? PayAmount { get; set; }
    public string? PayPeriod { get; set; }

    public string? Phone { get; set; }
    public string? Telegram { get; set; }

    public bool IsActive { get; set; } = true;

    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
}
