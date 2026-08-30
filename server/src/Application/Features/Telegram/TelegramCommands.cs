namespace Shifter.Application.Features.Telegram;

public enum TelegramCommand
{
    None,
    Link,
    Today,
    Week,
    Tomorrow,
    Month,
    ClockIn,
    ClockOut,
    Pay,
    TimeZone,
    Help,
}

/// <summary>
/// Turns whatever a person typed into one of the few things the bot does.
/// Deliberately forgiving: slashes optional, three languages, a bare
/// six-digit number reads as a link code.
/// </summary>
public static class TelegramCommands
{
    public static (TelegramCommand Command, string Argument) Parse(string? text)
    {
        var cleaned = (text ?? "").Trim();

        if (cleaned.Length == 0) return (TelegramCommand.None, "");

        // "/start ABC123" is how Telegram delivers a deep-link payload.
        if (cleaned.StartsWith("/start", StringComparison.OrdinalIgnoreCase))
        {
            var payload = cleaned[6..].Trim();

            return payload.Length > 0 ? (TelegramCommand.Link, payload) : (TelegramCommand.Help, "");
        }

        var lower = cleaned.TrimStart('/').ToLowerInvariant();

        if (lower.Length == 6 && lower.All(char.IsAsciiDigit))
            return (TelegramCommand.Link, lower);

        if (lower.StartsWith("tz ") || lower.StartsWith("часовой пояс "))
            return (TelegramCommand.TimeZone, cleaned[(cleaned.IndexOf(' ') + 1)..].Trim());

        return lower switch
        {
            "today" or "сегодня" or "сьогодні" => (TelegramCommand.Today, ""),
            "pay" or "зарплата" or "зарплатня" or "деньги" or "гроші" or "выплата" or "виплата"
                => (TelegramCommand.Pay, ""),
            "tomorrow" or "завтра" => (TelegramCommand.Tomorrow, ""),
            "week" or "неделя" or "тиждень" => (TelegramCommand.Week, ""),
            "month" or "месяц" or "місяць" => (TelegramCommand.Month, ""),
            "in" or "start" or "начал" or "начала" or "почав" or "почала" => (TelegramCommand.ClockIn, ""),
            "out" or "stop" or "закончил" or "закончила" or "закінчив" or "закінчила" => (TelegramCommand.ClockOut, ""),
            "help" or "помощь" or "довідка" => (TelegramCommand.Help, ""),
            _ => (TelegramCommand.None, ""),
        };
    }

    /// <summary>
    /// Russian/Ukrainian three-way declension: 1 смена, 2 смены, 5 смен —
    /// with the teens trap (11–14 always take the many-form).
    /// </summary>
    public static string Plural(int count, string one, string few, string many)
    {
        var tens = count % 100;
        var units = count % 10;

        if (tens is >= 11 and <= 14) return many;

        return units switch
        {
            1 => one,
            >= 2 and <= 4 => few,
            _ => many,
        };
    }
}
