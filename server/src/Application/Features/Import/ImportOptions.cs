namespace Shifter.Application.Features.Import;

/// <summary>The photo-import brain.</summary>
public sealed class ImportOptions
{
    public const string Section = "Import";

    public string ApiKey { get; set; } = "";

    /// <summary>Cheap and fast reads a wall rota fine; accuracy over poetry.</summary>
    public string Model { get; set; } = "claude-haiku-4-5-20251001";

    /// <summary>Per-account daily ceiling; a photo costs real money.</summary>
    public int DailyLimit { get; set; } = 10;

    public bool Enabled => ApiKey != "";
}
