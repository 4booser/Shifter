using System.Reflection;
using System.Text;
using Shifter.Application.Common.Options;
using Shifter.Application.Features.Auth.Services;
using Shifter.Application.Features.Auth.Services.Interfaces;
using Shifter.Application.Features.business.Services;
using Shifter.Application.Features.business.Services.Interfaces;

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
        // The committed appsettings value is a development placeholder. Anyone
        // with the repository can mint a token for any account with it, so the
        // real key comes from the environment.
        const string committedKey = "SAkjhgaksituKJDAFJG742thjgkLES&Gg3ksd";
        string? fromEnvironment = configuration["SHIFTER_JWT_KEY"];

        services.AddOptions<TokenOptions>()
            .Bind(configuration.GetSection(TokenOptions.SectionName))
            .PostConfigure(options =>
            {
                if (!string.IsNullOrWhiteSpace(fromEnvironment))
                {
                    options.Key = fromEnvironment;

                    return;
                }

                if (options.Key == committedKey)
                {
                    Serilog.Log.Warning(
                        "Using the signing key committed to source control. Set "
                        + "SHIFTER_JWT_KEY before running anywhere real.");
                }
            })
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
        services.AddScoped<IAuthTokenIssuer, AuthTokenIssuer>();

        services.AddScoped<IShiftHandler, ShiftHandler>();
        services.AddScoped<ISalesHandler, SalesHandler>();
        services.AddScoped<IDayHandler, DayHandler>();
        services.AddScoped<IPayoutHandler, PayoutHandler>();
        services.AddScoped<ILocationHandler, LocationHandler>();

        return services;
    }
}
