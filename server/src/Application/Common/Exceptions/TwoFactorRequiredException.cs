namespace Shifter.Application.Common.Exceptions;

/// <summary>
/// Not a failure: the password held, and the conversation continues with a
/// code. Carries the short-lived ticket the second step redeems.
/// </summary>
public sealed class TwoFactorRequiredException(string ticket)
    : Exception("A one-time code is required.")
{
    public string Ticket { get; } = ticket;
}
