namespace Shifter.Application.Common.Text;

/// <summary>A phrase in the language somebody reads.</summary>
public readonly record struct Say(string Lang)
{
    public const string Default = "ru";

    /// <summary>Only what the app itself offers; anything else reads as Russian.</summary>
    public static string Known(string? lang) => lang == "uk" ? "uk" : Default;

    public static Say In(string? lang) => new(Known(lang));

    public bool IsUk => Lang == "uk";

    public string Of(string ru, string uk) => IsUk ? uk : ru;
}
