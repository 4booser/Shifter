namespace Shifter.Application.Common.Exceptions;

public class ValidationException : Exception
{
    /// <summary>Machine-readable name for the client's dictionary; see UnauthorizedException.</summary>
    public string? Code { get; }

    public ValidationException(string message, string? code = null)
        : base(message)
    {
        Code = code;
    }
}