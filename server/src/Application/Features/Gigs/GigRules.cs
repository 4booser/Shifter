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
        _ => throw new ValidationException("pay_period must be hour or shift."),
    };

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
    /// A response must carry at least one way to reach the person — a reply
    /// the owner cannot answer is noise for both sides.
    /// </summary>
    public static (string? Phone, string? Telegram) CleanContacts(string? phone, string? telegram)
    {
        var cleanPhone = CleanOptional(phone, GigResponse.ContactMax, "Phone");
        var cleanTelegram = CleanOptional(telegram, GigResponse.ContactMax, "Telegram");

        if (cleanPhone is null && cleanTelegram is null)
            throw new ValidationException("Share a phone or a Telegram — the venue has to be able to reach you.");

        return (cleanPhone, cleanTelegram);
    }
}
