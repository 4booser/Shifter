namespace Shifter.Application.Features.Telegram;

public enum TelegramCommand
{
    None,
    Link,
    Today,
    Tomorrow,
    Month,
    ClockIn,
    ClockOut,
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
            "tomorrow" or "завтра" => (TelegramCommand.Tomorrow, ""),
            "month" or "месяц" or "місяць" => (TelegramCommand.Month, ""),
            "in" or "start" or "начал" or "начала" or "почав" or "почала" => (TelegramCommand.ClockIn, ""),
            "out" or "stop" or "закончил" or "закончила" or "закінчив" or "закінчила" => (TelegramCommand.ClockOut, ""),
            "help" or "помощь" or "довідка" => (TelegramCommand.Help, ""),
            _ => (TelegramCommand.None, ""),
        };
    }
}
