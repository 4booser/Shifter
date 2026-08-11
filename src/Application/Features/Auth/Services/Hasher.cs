using System.Security.Cryptography;
using System.Text;
using Shifter.Application.Features.Auth.Services.Interfaces;

namespace Shifter.Application.Features.Auth.Services;

public class Hasher : IHasher
{
    private readonly string _secretKey;

    public Hasher(IConfiguration _config)
    { 
        _secretKey = _config["TokenOptions:Key"] 
                     ?? throw new ArgumentNullException("TokenOptions:Key configuration is missing.");
    }
    
    public string Hash(string creds)
    {
        var keyBytes = Encoding.UTF8.GetBytes(_secretKey);
        var tokenBytes = Encoding.UTF8.GetBytes(creds);

        var hashBytes = HMACSHA256.HashData(keyBytes, tokenBytes);

        return Convert.ToHexString(hashBytes);
    }
}