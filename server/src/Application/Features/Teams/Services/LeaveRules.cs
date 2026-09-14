using Shifter.Domain.Entities;

namespace Shifter.Application.Features.Teams.Services;

/// <summary>What a leave request has to satisfy before anybody is asked to answer it.</summary>
public static class LeaveRules
{
    /// <summary>Whether two requests cover any of the same days.</summary>
    public static bool Overlaps(LeaveRequest existing, DateOnly from, DateOnly to)
        => existing.From <= to && existing.To >= from;

    /// <summary>Whether an approved request should keep somebody off the rota on a day.</summary>
    public static bool Blocks(LeaveRequest request, DateOnly date)
        => request.Status == LeaveStatus.Approved && request.Covers(date);

    /// <summary>The reason, cleaned.</summary>
    public static string? CleanReason(string? reason)
    {
        if (string.IsNullOrWhiteSpace(reason)) return null;

        string text = reason.Trim();

        return text.Length > LeaveRequest.ReasonMax ? text[..LeaveRequest.ReasonMax] : text;
    }
}
