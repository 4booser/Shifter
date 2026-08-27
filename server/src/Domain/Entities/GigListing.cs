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
    Managing = 18,
    Chef = 19,
    SousChef = 20,
    ShiftLead = 21,
    Sommelier = 22,
    Busser = 23,
    CookUniversal = 24,
    Grill = 25,
    Wok = 26,
    Cleaner = 27,
    Storekeeper = 28,
    Administrator = 29,
    Hookah = 30,
    Shawarma = 31,
    Butcher = 32,
    Security = 33,
    Dj = 34,
    Promoter = 35,
}

/// <summary>One night's cover, or a seat on the roster.</summary>
public enum GigEmployment
{
    Freelance = 0,
    Permanent = 1,
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
    public const int ScheduleMax = 80;
    public const int MinPhotos = 3;
    public const int MaxPhotos = 6;
    /// <summary>Base64 budget per photo — a client-side 900px JPEG fits well under it.</summary>
    public const int PhotoBudget = 220_000;
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

    public GigEmployment Employment { get; set; } = GigEmployment.Freelance;

    /// <summary>
    /// The venue, seen: at least three photos, JSON array of small JPEG data
    /// URLs the client already shrank. A listing without a face is exactly
    /// the listing people scroll past — and the board is worth looking at
    /// only when every card can be looked at.
    /// </summary>
    public string PhotosJson { get; set; } = "[]";

    /// <summary>Permanent roles: the rhythm in the venue's words — "2/2", "5/2 с 10:00".</summary>
    public string? Schedule { get; set; }

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

    /// <summary>
    /// Percent of sales on top of (or instead of) the base — hospitality's
    /// oldest sweetener. Null means the pay is the base alone.
    /// </summary>
    public decimal? PayPercent { get; set; }

    public required string City { get; set; }

    /// <summary>How many people this listing needs. Accepted responses count against it.</summary>
    public int Slots { get; set; } = 1;

    public GigStatus Status { get; set; } = GigStatus.Open;

    /// <summary>
    /// The half of the share link that cannot be guessed.
    ///
    /// The preview at /g/… is anonymous on purpose — a link pasted into a work
    /// chat has to unfurl for people who are not signed in. But it used to be
    /// keyed on the primary key, so counting from one handed the whole board
    /// to exactly the scraper the board's own rules say must not have it. A
    /// link still works for anybody who has it; nobody can produce one they
    /// were not given.
    /// </summary>
    public string ShareSlug { get; set; } = NewSlug();

    /// <summary>
    /// Twelve characters of base32 — short enough to paste, far too much to
    /// walk. Ambiguous letters are left out so a slug read aloud survives.
    /// </summary>
    public static string NewSlug()
    {
        const string alphabet = "abcdefghjkmnpqrstuvwxyz23456789";
        byte[] bytes = System.Security.Cryptography.RandomNumberGenerator.GetBytes(12);

        return string.Concat(bytes.Select(b => alphabet[b % alphabet.Length]));
    }

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    public List<GigResponse>? Responses { get; set; }
}
