using Shifter.Application.Features.Auth.DTOs;

namespace Shifter.Application.Features.Auth.Services.Interfaces;

public interface IRegisterService
{
    public Task<AuthResponseDTO> Handle(RegisterDTO request, CancellationToken ct);
    
    
}