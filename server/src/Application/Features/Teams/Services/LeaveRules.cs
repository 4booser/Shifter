using Shifter.Domain.Entities;

namespace Shifter.Application.Features.Teams.Services;

/// <summary>
/// What a leave request has to satisfy before anybody is asked to answer it.
/// Kept apart from the service so the rules can be read — and tested — without
/// a database behind them.
/// </summary>
public static class LeaveRules
{
    /// <summary>
    /// Whether two requests cover any of the same days. Used to refuse a second
    /// request over the same dates: two rows asking for one fortnight is not
    /// two requests, it is one request nobody can answer cleanly.
    /// </summary>
    public static bool Overlaps(LeaveRequest existing, DateOnly from, DateOnly to)
        => existing.From <= to && existing.To >= from;

    /// <summary>
    /// Whether an approved request should keep somebody off the rota on a day.
    /// Only approved leave blocks: a request still waiting is a question, and
    /// planning around a question is how people end up with neither the shift
    /// nor the holiday.
    /// </summary>
    public static bool Blocks(LeaveRequest request, DateOnly date)
        => request.Status == LeaveStatus.Approved && request.Covers(date);

    /// <summary>
    /// The reason, cleaned. Absent is normal — most people do not explain a
    /// holiday, and demanding it would only teach them to type a full stop.
    /// </summary>
    public static string? CleanReason(string? reason)
    {
        if (string.IsNullOrWhiteSpace(reason)) return null;

        string text = reason.Trim();

        return text.Length > LeaveRequest.ReasonMax ? text[..LeaveRequest.ReasonMax] : text;
    }
}
