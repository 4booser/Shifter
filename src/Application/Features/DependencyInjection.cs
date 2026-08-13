using System.Reflection;
using System.Text;
using Shifter.Application.Common.Options;
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

        // ValidateOnStart turns a misconfigured signing key into a startup
        // failure instead of tokens that silently fail to validate at runtime.
        services.AddOptions<TokenOptions>()
            .Bind(configuration.GetSection(TokenOptions.SectionName))
            .Validate(
                options => Encoding.UTF8.GetByteCount(options.Key) >= 32,
                "TokenOptions:Key must be at least 32 bytes for HMAC-SHA256.")
            .Validate(
                options => !string.IsNullOrWhiteSpace(options.Issuer),
                "TokenOptions:Issuer is missing.")
            .Validate(
                options => !string.IsNullOrWhiteSpace(options.Audience),
                "TokenOptions:Audience is missing.")
            .Validate(
                options => options.AccessTokenLifetimeMinutes > 0,
                "TokenOptions:AccessTokenLifetimeMinutes must be positive.")
            .Validate(
                options => options.RefreshTokenLifetimeDays > 0,
                "TokenOptions:RefreshTokenLifetimeDays must be positive.")
            .ValidateOnStart();

        services.AddScoped<IJwtService, JwtService>();
        services.AddSingleton<IHasher, Hasher>();

        return services;
    }
}
