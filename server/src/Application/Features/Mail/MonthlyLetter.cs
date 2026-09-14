using System.Globalization;
using System.Text;
using Shifter.Application.Common.Text;

namespace Shifter.Application.Features.Mail;

/// <summary>The month, in a letter.</summary>
public static class MonthlyLetter
{
    public sealed record Facts(
        string Month,
        decimal Earned,
        decimal Tips,
        double Hours,
        int Days,
        /// <summary>The same month last year, where there was one.</summary>
        decimal? LastYear,
        /// <summary>The month before this one.</summary>
        decimal? Previous,
        /// <summary>The best day, as a date and an amount.</summary>
        (string Date, decimal Earned)? Best,
        /// <summary>Days worked but never closed off — the only nag in the letter.</summary>
        int Unclosed);

    /// <summary>The subject line: the figure, because that is what the letter is for and burying it makes the letter look…</summary>
    public static string Subject(Facts facts, string money)
        => $"{facts.Month}: {money}";

    /// <summary>Plain HTML with inline styles and no images.</summary>
    public static string Html(
        Facts facts,
        Func<decimal, string> money,
        Func<string, string> t,
        string unsubscribe)
    {
        var body = new StringBuilder();

        body.Append(
            "<div style=\"font-family:-apple-system,Segoe UI,Roboto,sans-serif;"
            + "max-width:520px;margin:0 auto;padding:24px;color:#1c1b18\">");

        body.Append($"<p style=\"margin:0 0 4px;color:#6d6a61;font-size:13px\">{Escape(facts.Month)}</p>");
        body.Append(
            $"<p style=\"margin:0 0 20px;font-size:32px;font-weight:700\">{Escape(money(facts.Earned))}</p>");

        body.Append("<table style=\"width:100%;border-collapse:collapse;font-size:14px\">");

        Row(body, t("Worked"), $"{facts.Days} · {Hours(facts.Hours, t)}");

        if (facts.Tips > 0m) Row(body, t("Of that, tips"), money(facts.Tips));

                // Raw: Row does the escaping, and escaping twice turns "&" into
        // "&amp;amp;" in front of the reader.
        if (facts.Best is { } best) Row(body, t("Best day"), $"{best.Date} · {money(best.Earned)}");

        // Comparisons only where there is something to compare with. "+0%
        // against nothing" is the sort of line that teaches people the letter
        // is padding.
        if (facts.Previous is decimal previous && previous > 0m)
            Row(body, t("Month before"), Change(facts.Earned, previous, money));

        if (facts.LastYear is decimal lastYear && lastYear > 0m)
            Row(body, t("Same month last year"), Change(facts.Earned, lastYear, money));

        body.Append("</table>");

        if (facts.Unclosed > 0)
        {
            body.Append(
                "<p style=\"margin:20px 0 0;padding:12px;background:#fdf5e6;border-radius:8px;font-size:14px\">"
                + Escape($"{t("Days worked but not filled in")}: {facts.Unclosed}")
                + "</p>");
        }

        // One link, no login, no preference centre. The difference between a
        // letter people tolerate and one they mark as spam.
        body.Append(
            $"<p style=\"margin:28px 0 0;font-size:12px;color:#9c988c\">"
            + $"<a href=\"{Escape(unsubscribe)}\" style=\"color:#9c988c\">{Escape(t("Stop these letters"))}</a>"
            + "</p>");

        body.Append("</div>");

        return body.ToString();
    }

    private static void Row(StringBuilder body, string label, string value)
        => body.Append(
            "<tr><td style=\"padding:6px 0;color:#6d6a61\">" + Escape(label)
            + "</td><td style=\"padding:6px 0;text-align:right;font-weight:600\">" + Escape(value)
            + "</td></tr>");

    private static string Change(decimal now, decimal then, Func<decimal, string> money)
    {
        var share = (now - then) / then;
        var sign = share >= 0 ? "+" : "−";

        return $"{money(then)} · {sign}{Math.Abs(Math.Round(share * 100))}%";
    }

    /// <summary>The letter used to write «199.5 h» — an invariant decimal point and an English unit, inside a letter that is…</summary>
    private static string Hours(double hours, Func<string, string> t)
        => $"{Figures.Hours(hours)} {t("h")}";

    /// <summary>A venue called "Bar &amp; Grill" must not become markup, and a note somebody typed must never reach a mail…</summary>
    private static string Escape(string value)
        => value
            .Replace("&", "&amp;")
            .Replace("<", "&lt;")
            .Replace(">", "&gt;")
            .Replace("\"", "&quot;");
}
