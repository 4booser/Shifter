namespace Shifter.Application.Common.Exceptions;

/// <summary>
/// Thrown when a caller has knocked too many times: the middleware turns it
/// into 429 and writes RetryAfter into the header of the same name.
/// </summary>
public class TooManyAttemptsException : Exception
{
    public TimeSpan RetryAfter { get; }

    public TooManyAttemptsException(string message, TimeSpan retryAfter)
        : base(message)
    {
        RetryAfter = retryAfter;
    }
}
