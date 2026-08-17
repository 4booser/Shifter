namespace Shifter.Application.Common.Exceptions;

public class ArgException : Exception
{
    public ArgException(string message)
        : base(message) { }
}