using Shifter.Application.Features.Auth.DTOs;

namespace Shifter.Application.Features.Auth.Services.Interfaces;

public interface ILoginHandler
{
    public Task<AuthResponseDto> Handle(LoginDto request, CancellationToken ct);
}