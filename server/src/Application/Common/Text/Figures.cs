using System.Globalization;

namespace Shifter.Application.Common.Text;

/// <summary>How this application writes a number for somebody to read.</summary>
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
    public static string Money(decimal value) => Money(value, Ru);

    /// <summary>The same, for a page that knows which language it is in.</summary>
    public static string Money(decimal value, CultureInfo culture) =>
        $"{Math.Round(value).ToString("N0", culture)} ₴";

    /// <summary>A plain count, grouped the way the money beside it is.</summary>
    public static string Count(double value) => Count(value, Ru);

    /// <summary>The same, for a page that knows which language it is in.</summary>
    public static string Count(double value, CultureInfo culture) =>
        Math.Round(value).ToString("N0", culture);

    /// <summary>Hours, to a tenth under ten and whole above it.</summary>
    public static string Hours(double value) =>
        Math.Round(value, value < 10 ? 1 : 0).ToString(value < 10 ? "N1" : "N0", Ru);
}
