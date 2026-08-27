namespace Shifter.Domain.Entities;

/// <summary>
/// One side's verdict on a shift that actually happened. Both directions
/// live in the same row type: a worker rates the venue that hired them, the
/// venue rates the worker it took — always pinned to one listing, so a
/// grudge cannot be filed twice and a stranger cannot file one at all.
/// </summary>
public sealed class GigReview
{
    public const int TextMax = 300;
    public const int ChipsMax = 120;

    public int Id { get; set; }

    public int ListingId { get; set; }
    public GigListing? Listing { get; set; }

    public int AuthorUserId { get; set; }

    /// <summary>Whose reputation this lands on.</summary>
    public int TargetUserId { get; set; }

    /// <summary>true = the venue rating its worker; false = the worker rating the venue.</summary>
    public bool ByEmployer { get; set; }

    /// <summary>1–5.</summary>
    public int Rating { get; set; }

    /// <summary>Comma-joined chip ids: "punctual,fast".</summary>
    public string? Chips { get; set; }

    public string? Text { get; set; }

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}
