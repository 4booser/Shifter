namespace Shifter.Application.Common.Text;

/// <summary>
/// A phrase in the language somebody reads.
///
/// Two languages held side by side in the source rather than in parallel
/// files. A dictionary keyed on one of them is right for an interface, where
/// the same label appears in forty places; a paragraph appears once, and the
/// only way to see whether the Ukrainian says what the Russian says is to have
/// them on the same line.
///
/// Anything unknown falls back to Russian, which is what this app was written
/// in and what every stored row already holds.
/// </summary>
public readonly record struct Say(string Lang)
{
    public const string Default = "ru";

    /// <summary>Only what the app itself offers; anything else reads as Russian.</summary>
    public static string Known(string? lang) => lang == "uk" ? "uk" : Default;

    public static Say In(string? lang) => new(Known(lang));

    public bool IsUk => Lang == "uk";

    public string Of(string ru, string uk) => IsUk ? uk : ru;
}
