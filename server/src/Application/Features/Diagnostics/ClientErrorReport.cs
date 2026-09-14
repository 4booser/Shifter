using System.Text.RegularExpressions;

namespace Shifter.Application.Features.Diagnostics;

/// <summary>A crash the browser saw, cut down to what is safe to keep.</summary>
public static partial class ClientErrorReport
{
    /// <summary>Long enough for a message and the top of a stack; short enough that a pasted document cannot ride in on it.</summary>
    public const int MessageMax = 600;

    private const int PathMax = 120;
    private const int BuildMax = 40;

    /// <summary>Anything that looks like an address, a token or a long number is replaced rather than shortened: truncation…</summary>
    public static string Clean(string? message)
    {
        if (string.IsNullOrWhiteSpace(message)) return string.Empty;

        string text = message.Trim();

        text = Emails().Replace(text, "[email]");
        text = QueryStrings().Replace(text, "?[stripped]");
        text = Tokens().Replace(text, "[token]");
        text = LongDigits().Replace(text, "[number]");

        return text.Length > MessageMax ? text[..MessageMax] : text;
    }

    /// <summary>Where it happened, as a path with no query and no fragment.</summary>
    public static string CleanPath(string? path)
    {
        if (string.IsNullOrWhiteSpace(path)) return "/";

        string text = path.Split('?')[0].Split('#')[0].Trim();

        if (!text.StartsWith('/')) text = "/" + text;

        return text.Length > PathMax ? text[..PathMax] : text;
    }

    /// <summary>Which build it was, so a fixed fault stops being chased.</summary>
    public static string CleanBuild(string? build)
    {
        if (string.IsNullOrWhiteSpace(build)) return "unknown";

        string text = NotBuildish().Replace(build.Trim(), string.Empty);

        return text.Length == 0
            ? "unknown"
            : text.Length > BuildMax ? text[..BuildMax] : text;
    }

    [GeneratedRegex(@"[\w.+-]+@[\w-]+\.[\w.-]+")]
    private static partial Regex Emails();

    [GeneratedRegex(@"\?[^\s""']+")]
    private static partial Regex QueryStrings();

    [GeneratedRegex(@"\d{6,}")]
    private static partial Regex LongDigits();

    [GeneratedRegex(@"\b[A-Za-z0-9_-]{24,}\b")]
    private static partial Regex Tokens();

    [GeneratedRegex(@"[^A-Za-z0-9._-]")]
    private static partial Regex NotBuildish();
}
