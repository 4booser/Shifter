using System.Security.Cryptography;
using System.Text;
using Microsoft.Extensions.Options;
using Shifter.Application.Common.Options;
using Shifter.Application.Features.Auth.Services.Interfaces;

namespace Shifter.Application.Features.Auth.Services;

public class Hasher : IHasher
{
    private readonly string _secretKey;

    public Hasher(IOptions<TokenOptions> options)
    {
        _secretKey = options.Value.Key;
    }

    public string Hash(string creds)
    {
        var keyBytes = Encoding.UTF8.GetBytes(_secretKey);
        var tokenBytes = Encoding.UTF8.GetBytes(creds);

        var hashBytes = HMACSHA256.HashData(keyBytes, tokenBytes);

        return Convert.ToHexString(hashBytes);
    }
}
