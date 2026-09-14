namespace Shifter.Application.Common.Exceptions;

public class UnauthorizedException : Exception
{
    /// <summary>Machine-readable name for the client's dictionary ("auth.invalid").</summary>
    public string? Code { get; }

    public UnauthorizedException(string message, string? code = null)
        : base(message)
    {
        Code = code;
    }
}