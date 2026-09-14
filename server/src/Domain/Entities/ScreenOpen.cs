namespace Shifter.Domain.Entities;

/// <summary>How often a screen was opened on a day.</summary>
public sealed class ScreenOpen
{
    public const int NameMax = 40;

    public int Id { get; set; }

    /// <summary>The day, on the server's own clock.</summary>
    public required DateOnly Day { get; set; }

    /// <summary>A short name from a fixed list — never a path, never a query.</summary>
    public required string Screen { get; set; }

    public int Count { get; set; }
}
