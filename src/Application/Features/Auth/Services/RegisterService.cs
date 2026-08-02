using System.Security.Claims;
using Shifter.Application.Features.Auth.DTOs;
using Shifter.Application.Features.Auth.Services.Interfaces;
using Shifter.Domain.Entities;

namespace Shifter.Application.Features.Auth.Services;

public class RegisterService : IRegisterService
{
    private readonly JwtService _jwtService;
    
    public RegisterService(JwtService jwtService)
    {
        _jwtService = jwtService;
    }
    
    public AuthResponseDTO Handle(RegisterDTO request, CancellationToken ct)
    {
        User user = new User()
        {
            Id = 1,
            FirstName = request.first_name,
            LastName = request.last_name,
            Login = request.login,
            PasswordHash = request.password,
            CreatedAt = DateTime.UtcNow,
            LastLogin = DateTime.UtcNow
        };

        Claim[] claims =
        {
            new Claim(ClaimTypes.NameIdentifier, user.Id.ToString()),
            new Claim(ClaimTypes.Name, user.Login)
        };
        
        string accessToken = _jwtService.GenerateAccessToken(claims);
        string refreshToken = _jwtService.GenerateRefreshToken();
        DateTime expires = DateTime.UtcNow.AddMinutes(15);

        return new AuthResponseDTO(
            accessToken,
            refreshToken,
            expires
        );
    }
}