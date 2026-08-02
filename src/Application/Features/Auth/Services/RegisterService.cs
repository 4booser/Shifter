using System.Security.Claims;
using Shifter.Application.Common.Exceptions;
using Shifter.Application.Features.Auth.DTOs;
using Shifter.Application.Features.Auth.Services.Interfaces;
using Shifter.Domain.Entities;
using Shifter.Infrastructure.Repositories.Interfaces;

namespace Shifter.Application.Features.Auth.Services;

public class RegisterService : IRegisterService
{
    private readonly JwtService _jwtService;
    private readonly IUserCommand _userCommand;
    
    public RegisterService(
        JwtService jwtService,
        IUserCommand userCommand)
    {
        _jwtService = jwtService;
        _userCommand = userCommand;
    }
    
    public async Task<AuthResponseDTO> Handle(RegisterDTO request, CancellationToken ct)
    {
        DateTime now = DateTime.UtcNow;
        
        User user = new User()
        {
            Id = 1,
            FirstName = request.first_name,
            LastName = request.last_name,
            Login = request.login,
            PasswordHash = request.password,
            CreatedAt = now,
            LastLogin = now
        };

        if (! await _userCommand.AddAsync(user, ct))
            throw new ForbiddenException("Can`t add user.");
        
        Claim[] claims =
        {
            new Claim(ClaimTypes.NameIdentifier, user.Id.ToString()),
            new Claim(ClaimTypes.Name, user.Login)
        };
        
        string accessToken = _jwtService.GenerateAccessToken(claims);
        string refreshToken = _jwtService.GenerateRefreshToken();
        DateTime expires = now.AddMinutes(15);

        return new AuthResponseDTO(
            accessToken,
            refreshToken,
            expires
        );
    }
}