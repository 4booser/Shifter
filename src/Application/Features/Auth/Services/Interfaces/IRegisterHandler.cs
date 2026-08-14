using Shifter.Application.Features.Auth.DTOs;

namespace Shifter.Application.Features.Auth.Services.Interfaces;

public interface IRegisterHandler
{
    public Task<AuthResponseDto> Handle(RegisterDto request, CancellationToken ct);
    
    
}