namespace Shifter.Domain.Entities;

/// <summary>
/// One Telegram chat bound to one account. The bridge for "что у меня
/// завтра" without opening the app — and for clocking in from the chat,
/// which is where shift workers already live.
/// </summary>
public sealed class TelegramLink
{
    public int Id { get; set; }

    public int UserId { get; set; }

    public long ChatId { get; set; }

    /// <summary>The clock the chat speaks; the audience's default.</summary>
    public string TimeZone { get; set; } = "Europe/Kyiv";

    /// <summary>"ru", "uk" or "en".</summary>
    public string Language { get; set; } = "ru";

    /// <summary>Set by «начал»; consumed by «закончил».</summary>
    public DateTime? ClockInAtUtc { get; set; }

    public DateTime LinkedAt { get; set; } = DateTime.UtcNow;
}
