using Shifter.Application.Common.Exceptions;
using Shifter.Domain.Entities;

namespace Shifter.Application.Features.Gigs;

/// <summary>The pure half of the board: validation and vocabulary, no I/O.</summary>
public static class GigRules
{
    /// <summary>Wire names, stable across languages; the UI translates them.</summary>
    public static readonly IReadOnlyDictionary<GigCategory, string> CategoryNames =
        new Dictionary<GigCategory, string>
        {
            [GigCategory.Bartender] = "bartender",
            [GigCategory.Barback] = "barback",
            [GigCategory.Barista] = "barista",
            [GigCategory.Waiter] = "waiter",
            [GigCategory.Runner] = "runner",
            [GigCategory.Host] = "host",
            [GigCategory.Cashier] = "cashier",
            [GigCategory.CookHot] = "cook-hot",
            [GigCategory.CookCold] = "cook-cold",
            [GigCategory.Prep] = "prep",
            [GigCategory.Pizzaiolo] = "pizzaiolo",
            [GigCategory.Sushi] = "sushi",
            [GigCategory.Pastry] = "pastry",
            [GigCategory.Baker] = "baker",
            [GigCategory.Dishwasher] = "dishwasher",
            [GigCategory.Courier] = "courier",
            [GigCategory.Catering] = "catering",
            [GigCategory.FloorManager] = "floor-manager",
            [GigCategory.Managing] = "managing",
            [GigCategory.Chef] = "chef",
            [GigCategory.SousChef] = "sous-chef",
            [GigCategory.ShiftLead] = "shift-lead",
            [GigCategory.Sommelier] = "sommelier",
            [GigCategory.Busser] = "busser",
            [GigCategory.CookUniversal] = "cook-universal",
            [GigCategory.Grill] = "grill",
            [GigCategory.Wok] = "wok",
            [GigCategory.Cleaner] = "cleaner",
            [GigCategory.Storekeeper] = "storekeeper",
            [GigCategory.Administrator] = "administrator",
            [GigCategory.Hookah] = "hookah",
            [GigCategory.Shawarma] = "shawarma",
            [GigCategory.Butcher] = "butcher",
            [GigCategory.Security] = "security",
            [GigCategory.Dj] = "dj",
            [GigCategory.Promoter] = "promoter",
        };

    /// <summary>Up to three trades a seeker offers, serialised as wire names.</summary>
    public static string CleanSeekerCategories(string[]? categories)
    {
        var parsed = (categories ?? [])
            .Select(ParseCategory)
            .Distinct()
            .Take(3)
            .Select(category => CategoryNames[category])
            .ToArray();

        if (parsed.Length == 0)
            throw new ValidationException("Pick at least one trade.");

        return string.Join(',', parsed);
    }

    /// <summary>
    /// Human names for the share preview — a chat card reading "bartender"
    /// in a Russian sentence looks like a bug, because it is one.
    /// </summary>
    public static readonly IReadOnlyDictionary<GigCategory, string> CategoryRu =
        new Dictionary<GigCategory, string>
        {
            [GigCategory.Bartender] = "бармен",
            [GigCategory.Barback] = "барбек",
            [GigCategory.Barista] = "бариста",
            [GigCategory.Waiter] = "официант",
            [GigCategory.Runner] = "раннер",
            [GigCategory.Host] = "хостес",
            [GigCategory.Cashier] = "кассир",
            [GigCategory.CookHot] = "повар горячего цеха",
            [GigCategory.CookCold] = "повар холодного цеха",
            [GigCategory.Prep] = "заготовщик",
            [GigCategory.Pizzaiolo] = "пиццайоло",
            [GigCategory.Sushi] = "сушист",
            [GigCategory.Pastry] = "кондитер",
            [GigCategory.Baker] = "пекарь",
            [GigCategory.Dishwasher] = "посудомойщик",
            [GigCategory.Courier] = "курьер",
            [GigCategory.Catering] = "кейтеринг",
            [GigCategory.FloorManager] = "менеджер зала",
            [GigCategory.Managing] = "управляющий",
            [GigCategory.Chef] = "шеф-повар",
            [GigCategory.SousChef] = "су-шеф",
            [GigCategory.ShiftLead] = "старший смены",
            [GigCategory.Sommelier] = "сомелье",
            [GigCategory.Busser] = "сборщик столов",
            [GigCategory.CookUniversal] = "повар-универсал",
            [GigCategory.Grill] = "гриль",
            [GigCategory.Wok] = "вок-повар",
            [GigCategory.Cleaner] = "уборщик",
            [GigCategory.Storekeeper] = "кладовщик",
            [GigCategory.Administrator] = "администратор",
            [GigCategory.Hookah] = "кальянщик",
            [GigCategory.Shawarma] = "шаурмист",
            [GigCategory.Butcher] = "мясник-обвальщик",
            [GigCategory.Security] = "охранник",
            [GigCategory.Dj] = "диджей",
            [GigCategory.Promoter] = "промоутер",
        };

    public static GigCategory ParseCategory(string? value)
    {
        foreach (var (category, name) in CategoryNames)
            if (name == value?.Trim().ToLowerInvariant())
                return category;

        throw new ValidationException("Unknown category.");
    }

    public static string CleanRequired(string? value, int max, string what)
    {
        var cleaned = value?.Trim() ?? "";

        if (cleaned.Length == 0) throw new ValidationException($"{what} is required.");
        if (cleaned.Length > max) throw new ValidationException($"{what} must be at most {max} characters.");

        return cleaned;
    }

    public static string? CleanOptional(string? value, int max, string what)
    {
        var cleaned = value?.Trim();

        if (string.IsNullOrEmpty(cleaned)) return null;
        if (cleaned.Length > max) throw new ValidationException($"{what} must be at most {max} characters.");

        return cleaned;
    }

    public static string ParsePayPeriod(string? value) => value?.Trim().ToLowerInvariant() switch
    {
        "hour" => "hour",
        "shift" => "shift",
        "month" => "month",
        _ => throw new ValidationException("pay_period must be hour, shift or month."),
    };

    public static GigEmployment ParseEmployment(string? value) => value?.Trim().ToLowerInvariant() switch
    {
        null or "" or "freelance" => GigEmployment.Freelance,
        "permanent" => GigEmployment.Permanent,
        _ => throw new ValidationException("employment must be freelance or permanent."),
    };

    /// <summary>
    /// Three to six small JPEG data URLs, serialised for the row. The floor
    /// is the rule that gives the board its face: nobody answers a listing
    /// they cannot look at.
    /// </summary>
    public static string CleanPhotos(string[]? photos)
    {
        var list = (photos ?? []).Where(entry => !string.IsNullOrWhiteSpace(entry)).ToArray();

        if (list.Length < GigListing.MinPhotos)
            throw new ValidationException($"At least {GigListing.MinPhotos} photos of the venue.");

        if (list.Length > GigListing.MaxPhotos)
            throw new ValidationException($"At most {GigListing.MaxPhotos} photos.");

        foreach (var photo in list)
        {
            if (!photo.StartsWith("data:image/jpeg;base64,", StringComparison.Ordinal))
                throw new ValidationException("Photos are JPEG data URLs shrunk by the client.");

            if (photo.Length > GigListing.PhotoBudget)
                throw new ValidationException("A photo is too heavy — the client should have shrunk it.");
        }

        return System.Text.Json.JsonSerializer.Serialize(list);
    }

    public static (TimeOnly Start, TimeOnly End) ParseSlot(string? start, string? end)
    {
        if (!TimeOnly.TryParseExact(start, "HH:mm", out var from))
            throw new ValidationException("start must be HH:mm.");
        if (!TimeOnly.TryParseExact(end, "HH:mm", out var to))
            throw new ValidationException("end must be HH:mm.");
        if (from == to)
            throw new ValidationException("A gig cannot start and end at the same minute.");

        return (from, to);
    }

    /// <summary>
    /// The pay is a base, a percent of sales, or both — but never neither.
    /// Pure so the arithmetic of what a listing may promise is testable.
    /// </summary>
    public static decimal? ValidatePay(decimal amount, decimal? percent)
    {
        if (amount < 0)
            throw new ValidationException("The base pay cannot be negative.");

        if (percent is decimal value)
        {
            if (value is <= 0 or > 100)
                throw new ValidationException("A percent lives between 0 and 100.");

            return Math.Round(value, 1);
        }

        if (amount <= 0)
            throw new ValidationException("Name a base pay, a percent of sales, or both.");

        return null;
    }

    /// <summary>The chip vocabulary, one set per direction; unknown chips are dropped, not stored.</summary>
    public static readonly string[] WorkerChips = ["punctual", "fast", "self-starter", "would-rehire"];
    public static readonly string[] EmployerChips = ["pays-on-time", "as-promised", "good-crew", "would-return"];

    public static string? CleanChips(string[]? chips, bool byEmployer)
    {
        var allowed = byEmployer ? WorkerChips : EmployerChips;
        var kept = (chips ?? []).Where(chip => allowed.Contains(chip)).Distinct().Take(4).ToArray();

        return kept.Length == 0 ? null : string.Join(',', kept);
    }

    /// <summary>
    /// A response must carry at least one way to reach the person — a reply
    /// the owner cannot answer is noise for both sides.
    /// </summary>
    /// <summary>
    /// <paramref name="required"/> false is the venue's side of the handshake:
    /// it may pick somebody without leaving a number, and then the person
    /// simply has one fewer way to ask what time to come.
    /// </summary>
    public static (string? Phone, string? Telegram) CleanContacts(
        string? phone, string? telegram, bool required = true)
    {
        var cleanPhone = CleanOptional(phone, GigResponse.ContactMax, "Phone");
        var cleanTelegram = CleanOptional(telegram, GigResponse.ContactMax, "Telegram");

        if (required && cleanPhone is null && cleanTelegram is null)
            throw new ValidationException("Share a phone or a Telegram — the venue has to be able to reach you.");

        return (cleanPhone, cleanTelegram);
    }
}
