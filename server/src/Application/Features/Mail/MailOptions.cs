namespace Shifter.Application.Features.Mail;

/// <summary>
/// Transactional mail, off unless configured — the same contract as push,
/// import and the Telegram bot: no key, no feature, no crash.
/// </summary>
public sealed class MailOptions
{
    public const string Section = "Mail";

    /// <summary>Resend API key. Empty means the sender reports itself disabled.</summary>
    public string ApiKey { get; set; } = "";

    /// <summary>"Shifter &lt;no-reply@shifter.ink&gt;".</summary>
    public string From { get; set; } = "Shifter <no-reply@shifter.ink>";

    /// <summary>Where the links in letters point.</summary>
    public string Origin { get; set; } = "https://www.shifter.ink";
}
