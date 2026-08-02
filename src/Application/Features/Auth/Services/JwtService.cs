using System.Security.Claims;
using System.Text;
using Shifter.Application.Features.Auth.Services.Interfaces;
using Microsoft.IdentityModel.Tokens;
using System.IdentityModel.Tokens.Jwt;
using System.Security.Cryptography;
namespace Shifter.Application.Features.Auth.Services;

public class JwtService : IJwtService
{
    private readonly IConfiguration _config;
    
    private JwtService(IConfiguration config)
    {
        _config = config;
    }
    
    public string GenerateAccessToken(Claim[] claims)
    {
        var jwtKey = _config["TokenOptions:Key"]
                     ?? throw new InvalidOperationException("TokenOptions:Key is missing.");

        var issuer = _config["TokenOptions:Issuer"]
                     ?? throw new InvalidOperationException("TokenOptions:Issuer is missing.");

        var audience = _config["TokenOptions:Audience"]
                       ?? throw new InvalidOperationException("TokenOptions:Audience is missing.");

        var key = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(jwtKey));

        var creds = new SigningCredentials(key, SecurityAlgorithms.HmacSha256);
        
        var token = new JwtSecurityToken(
            issuer: issuer,
            audience: audience,
            claims: claims,
            expires: DateTime.UtcNow.AddMinutes(15),
            signingCredentials: creds
        );

        return new JwtSecurityTokenHandler().WriteToken(token);
    }
    
    public string GenerateRefreshToken()
    {
        var randomBytes = RandomNumberGenerator.GetBytes(64);
        var refreshToken = Convert.ToBase64String(randomBytes);

        return refreshToken;
    }
}