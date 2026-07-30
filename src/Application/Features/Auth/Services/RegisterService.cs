using Shifter.Application.Features.Auth.DTOs;
using Shifter.Application.Features.Auth.Services.Interfaces;
using Shifter.Domain.Entities;

namespace Shifter.Application.Features.Auth.Services;

public class RegisterService : IRegisterService
{
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
            
                    

       return new AuthResponseDTO("access", "refresh", DateTime.UtcNow.AddMinutes(15));
    }
}