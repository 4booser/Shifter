namespace Shifter.Api.Pages;

/// <summary>
/// The shell every page a stranger opens is written into.
///
/// There are two of them — the card somebody hands an employer and the
/// preview behind a shared shift — and until now each wrote its own document
/// from the doctype down. They drifted the way two copies do: the card grew a
/// stylesheet and a readable column, and the gig preview stayed three
/// paragraphs of system font against a bare background, which is what a link
/// from a chat opened into. They also each decided what language to write,
/// separately, and the second one only learned the rule because somebody
/// noticed the first had it.
///
/// So the shell is one thing now, and the rule that matters most lives in it:
/// these pages have no client in front of them, the server keeps no language
/// preference of its own, and the reader is the person the page exists for —
/// so the reader is who it asks.
/// </summary>
internal static class PublicPage
{
    /// <summary>Which of the two languages this server writes the reader asked for.</summary>
    internal static bool WantsUkrainian(HttpRequest request)
        => request.Headers.AcceptLanguage.ToString()
            .Split(',')
            .Select(part => part.Split(';')[0].Trim())
            .Any(tag => tag.StartsWith("uk", StringComparison.OrdinalIgnoreCase));

    /// <summary>
    /// The look, in one place. Deliberately small and deliberately not the
    /// application's own stylesheet: this page is served before any bundle
    /// exists, to a reader who may be on a chat's in-app browser, and it has
    /// to be readable with nothing loaded but itself.
    /// </summary>
    private const string Style = """
          *{box-sizing:border-box}
          body{margin:0;background:#f4f2ed;color:#1c1b18;font:16px/1.55 system-ui,sans-serif;padding:2rem 1.25rem}
          main{max-width:34rem;margin:0 auto}
          h1{font-size:1.6rem;margin:0 0 .25rem;letter-spacing:-.02em}
          .big{font-size:1.15rem;font-weight:700;margin:0 0 1.25rem}
          ul{list-style:none;padding:0;margin:0 0 1.25rem}
          li{padding:.5rem 0;border-bottom:1px solid #e3ded2}
          .roles{color:#6f6a5e}
          .lede{margin:0 0 1.25rem}
          footer{margin-top:2rem;color:#8c8578;font-size:.85rem}
          a{color:#4a44c8}
          @media (prefers-color-scheme:dark){
            body{background:#17171a;color:#ece9e2}
            li{border-bottom-color:#2f2e2a}
            .roles{color:#a7a196}
            footer{color:#8c8578}
            a{color:#a9a4ff}
          }
        """;

    /// <param name="uk">Ukrainian, as the reader asked.</param>
    /// <param name="title">The tab, and nothing else — cards add their own heading.</param>
    /// <param name="head">Whatever this page alone needs: og: tags, robots.</param>
    /// <param name="body">The inside of &lt;main&gt;, already escaped.</param>
    /// <param name="footer">
    /// The last line, which is not the same sentence on both pages and cannot
    /// be. The card's «посчитано по записанным сменам» is a claim about how
    /// its numbers were arrived at; under a shared shift advert, where
    /// nothing was counted at all, the same line simply is not true. Null
    /// gives the neutral one.
    /// </param>
    internal static string Render(bool uk, string title, string head, string body, string? footer = null)
        => $"""
            <!doctype html>
            <html lang="{(uk ? "uk" : "ru")}">
            <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1">
            <title>{title}</title>
            {head}
            <style>
            {Style}
            </style>
            </head>
            <body><main>
            {body}
            <footer>{footer ?? (uk ? "Оголошення з біржі" : "Объявление с биржи")} <a href="/">Shifter</a>.</footer>
            </main></body>
            </html>
            """;
}
