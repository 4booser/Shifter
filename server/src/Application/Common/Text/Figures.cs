using System.Globalization;

namespace Shifter.Application.Common.Text;

/// <summary>
/// How this application writes a number for somebody to read.
///
/// It was written four times, in four files, each one ending in
/// <c>.Replace(',', ' ')</c> aimed at a thousands separator. In ru-RU the
/// comma is the <em>decimal</em> separator, so the patch that grouped
/// thousands also destroyed a fraction: two hundredths of an hour came out
/// of the assistant as «0 0 ч», two numbers where there was one. And because
/// nothing ever set the sign, every one of the four wrote «-7 805 ₴» with a
/// hyphen while the interface a few pixels away wrote «−7 805 ₴».
///
/// One culture, set once. Nothing is patched out of a finished string.
/// </summary>
public static class Figures
{
    /// <summary>ru-RU with a plain space between thousands and a real minus.</summary>
    public static readonly CultureInfo Ru = Spaced("ru-RU");

    /// <summary>The same for Ukrainian.</summary>
    public static readonly CultureInfo Uk = Spaced("uk-UA");

    private static CultureInfo Spaced(string name)
    {
        var culture = (CultureInfo)CultureInfo.GetCultureInfo(name).Clone();

        culture.NumberFormat.NumberGroupSeparator = " ";
        culture.NumberFormat.NegativeSign = "−";

        return culture;
    }

    /// <summary>A whole number of hryvnia, with its mark.</summary>
    public static string Money(decimal value) => $"{Math.Round(value).ToString("N0", Ru)} ₴";

    /// <summary>A plain count, grouped the way the money beside it is.</summary>
    public static string Count(double value) => Math.Round(value).ToString("N0", Ru);

    /// <summary>
    /// Hours, to a tenth under ten and whole above it. Nobody reads «9,53 ч»,
    /// and nobody needs «199,0».
    /// </summary>
    public static string Hours(double value) =>
        Math.Round(value, value < 10 ? 1 : 0).ToString(value < 10 ? "N1" : "N0", Ru);
}
