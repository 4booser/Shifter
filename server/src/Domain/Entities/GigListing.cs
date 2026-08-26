namespace Shifter.Domain.Entities;

/// <summary>
/// The trade a one-off shift asks for. Deliberately hospitality-specific:
/// this board is for the industry the whole product lives in, and a real
/// taxonomy is what makes filters worth tapping.
/// </summary>
public enum GigCategory
{
    Bartender = 0,
    Barback = 1,
    Barista = 2,
    Waiter = 3,
    Runner = 4,
    Host = 5,
    Cashier = 6,
    CookHot = 7,
    CookCold = 8,
    Prep = 9,
    Pizzaiolo = 10,
    Sushi = 11,
    Pastry = 12,
    Baker = 13,
    Dishwasher = 14,
    Courier = 15,
    Catering = 16,
    FloorManager = 17,
}

public enum GigStatus
{
    Open = 0,
    /// <summary>Everyone needed has been found; stays visible to its people.</summary>
    Filled = 1,
    /// <summary>Withdrawn by the owner; hidden from the board.</summary>
    Closed = 2,
}

/// <summary>
/// One freelance shift somebody needs covered: a date, a slot, a rate and a
/// venue. Not employment — a gig. Contact details never live here; they
/// travel only inside an explicit response.
/// </summary>
public sealed class GigListing
{
    public const int TitleMax = 80;
    public const int VenueMax = 60;
    public const int CityMax = 40;
    public const int DetailsMax = 600;
    public const int MaxSlots = 20;

    public int Id { get; set; }

    public int OwnerUserId { get; set; }
    public User? Owner { get; set; }

    /// <summary>Where the shift happens: "Bar Dym", "Кофейня на Подоле".</summary>
    public required string Venue { get; set; }

    public GigCategory Category { get; set; }

    /// <summary>What the board calls it: "Бармен на закрытие", "Пицца-смена".</summary>
    public required string Title { get; set; }

    public string? Details { get; set; }

    public DateOnly Date { get; set; }
    public TimeOnly StartTime { get; set; }
    public TimeOnly EndTime { get; set; }

    /// <summary>The money, in the owner's words: per hour or for the whole shift.</summary>
    public decimal PayAmount { get; set; }

    /// <summary>"hour" or "shift".</summary>
    public required string PayPeriod { get; set; }

    public required string City { get; set; }

    /// <summary>How many people this listing needs. Accepted responses count against it.</summary>
    public int Slots { get; set; } = 1;

    public GigStatus Status { get; set; } = GigStatus.Open;

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    public List<GigResponse>? Responses { get; set; }
}
