using System.Security.Claims;
using Shifter.Domain.Entities;

namespace Shifter.Application.Features.Auth.Services.Interfaces;

public interface IJwtService
{
    public string GenerateAccessToken(Claim[] claims);
    public string GenerateRefreshToken();
}