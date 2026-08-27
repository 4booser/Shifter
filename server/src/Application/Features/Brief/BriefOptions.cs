namespace Shifter.Application.Features.Brief;

/// <summary>
/// The daily brief's model. Same contract as every other optional feature:
/// no key, no model — but unlike the others, the feature itself still works,
/// because the facts are ours and only the wording was ever the model's.
/// </summary>
public sealed class BriefOptions
{
    public const string Section = "Brief";

    /// <summary>Gemini API key. Empty means briefs are composed locally.</summary>
    public string ApiKey { get; set; } = "";

    /// <summary>The cheapest line that can hold a sentence together.</summary>
    public string Model { get; set; } = "gemini-flash-lite-latest";
}
