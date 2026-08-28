namespace Shifter.Application.Features.Teams.DTOs;

/// <summary>One person's slice of the night, and the share it came from.</summary>
public record PoolShareDto(
    int user_id,
    string name,
    /// <summary>The percentage on their own shift template.</summary>
    decimal percent,
    decimal amount,
    /// <summary>Whether this is the caller.</summary>
    bool mine);

/// <summary>
/// The night's pool and how it divides. Everybody who worked the shift sees
/// every share: that is not a hole in the privacy rules, it is the exact
/// transparency a pool exists for.
/// </summary>
public record PoolDto(
    string date,
    decimal amount,
    string? entered_by,
    PoolShareDto[] shares,
    /// <summary>
    /// What the percentages do not add up to. Not an error — a house often
    /// keeps a slice — but it should be visible rather than quietly absorbed.
    /// </summary>
    decimal unallocated);

public record PoolSaveDto(string? date, decimal amount);
