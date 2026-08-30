namespace Shifter.Application.Common.Exceptions;

public class UnauthorizedException : Exception
{
    /// <summary>
    /// Machine-readable name for the client's dictionary ("auth.invalid").
    /// Null on the many places where the English sentence is still the only
    /// contract; codes are added where a person actually reads the words.
    /// </summary>
    public string? Code { get; }

    public UnauthorizedException(string message, string? code = null)
        : base(message)
    {
        Code = code;
    }
}