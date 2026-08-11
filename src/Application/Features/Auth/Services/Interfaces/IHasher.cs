namespace Shifter.Application.Features.Auth.Services.Interfaces;

public interface IHasher
{
    public string Hash(string password);
}