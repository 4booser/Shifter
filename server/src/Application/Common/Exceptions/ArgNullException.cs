namespace Shifter.Application.Common.Exceptions;

public class ArgNullException : Exception
{
    public ArgNullException(string message)
        : base(message) { }
}