using System.Reflection;
using Shifter.Application.Features.Auth.Services;
using Shifter.Application.Features.Auth.Services.Interfaces;

namespace Shifter.Application.Features;

public static class DependencyInjection
{
    public static IServiceCollection AddApplication(
        this IServiceCollection services,
        IConfiguration configuration)
    {
        services.AddMediatR(cfg =>
            cfg.RegisterServicesFromAssembly(Assembly.GetExecutingAssembly()));

        services.AddScoped<IJwtService, JwtService>();
        services.AddScoped<IHasher, Hasher>();
        services.AddSingleton<IHasher, Hasher>();

        return services;
    }
}