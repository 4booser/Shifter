namespace Shifter.Application.Features.Assistant;

/// <summary>The case for a raise at one place, and whether there is one yet.</summary>
public record RaiseCaseDto(
    int location_id,
    string location_name,
    int months_here,
    /// <summary>Months since the rate last moved, or since they started.</summary>
    int months_since_raise,
    decimal per_hour,
    /// <summary>The facts, in the order they are worth saying.</summary>
    string[] points,
    bool worth_asking,
    /// <summary>Something they can send as it is. Null where there is no case yet.</summary>
    string? message,
    /// <summary>Why the case is thin, where it is. Null when it is not.</summary>
    string? weakness);
