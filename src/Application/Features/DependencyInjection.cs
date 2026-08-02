using Shifter.Application.Features.Auth.Services;
using Shifter.Application.Features.Auth.Services.Interfaces;

namespace Shifter.Application.Features;

public static class DependencyInjection
{
    public static IServiceCollection AddInfrastructure(
        this IServiceCollection services,
        IConfiguration configuration)
    {
        services.AddScoped<IJwtService, JwtService>();
        
        return services;
    }
}