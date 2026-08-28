using Shifter.Application.Features.business.DTOs;
using Shifter.Domain.Entities;

namespace Shifter.Application.Features.Gigs;

/// <summary>
/// What a listed shift is worth against the hours somebody already works.
///
/// A board full of rates tells nobody anything: 250 an hour is generous in one
/// city and a pay cut in another, and it is a pay cut for this person or not
/// depending on what their own hours pay. The app already knows their hourly —
/// it is the number the whole product is built around — so the comparison
/// costs one division and answers the only question the card actually raises.
/// </summary>
public static class GigWorth
{
    /// <summary>
    /// How few hours make an average worth quoting. Below this the figure is
    /// one lucky night rather than what somebody earns, and comparing against
    /// it would be worse than saying nothing.
    /// </summary>
    private const double EnoughHours = 20;

    /// <summary>
    /// The comparison, or null when there is nothing honest to say — no rate
    /// on the listing, no hours behind the person, or a rate quoted per month
    /// against an hourly life.
    /// </summary>
    public static GigWorthDto? Judge(
        decimal payAmount,
        string payPeriod,
        double listingHours,
        LocationTotalDto[] mine)
    {
        if (payAmount <= 0m) return null;

        double hours = mine.Sum(place => place.hours);

        if (hours < EnoughHours) return null;

        decimal earned = mine.Sum(place => place.earned);

        if (earned <= 0m) return null;

        decimal usual = earned / (decimal)hours;

        // Everything is brought to an hour, because that is the only unit the
        // two sides can be compared in. A shift priced per day divides by its
        // own length rather than by a guess.
        decimal offered = payPeriod switch
        {
            "hour" => payAmount,
            "shift" or "day" => listingHours > 0 ? payAmount / (decimal)listingHours : 0m,
            _ => 0m,
        };

        if (offered <= 0m) return null;

        decimal difference = Math.Round((offered - usual) * 100m / usual, 0);

        return new GigWorthDto(
            Math.Round(offered, 2),
            Math.Round(usual, 2),
            difference);
    }
}
