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

        // The signing key is never committed. SHIFTER_JWT_KEY wins where it is
        // set; otherwise the value comes from configuration, which in practice
        // means appsettings.Development.json for a local run and user-secrets
        // or the environment everywhere else. ValidateOnStart turns a missing
        // key into a startup failure rather than tokens that quietly fail to
        // validate at runtime.
        string? fromEnvironment = configuration["SHIFTER_JWT_KEY"];

        services.AddOptions<TokenOptions>()
            .Bind(configuration.GetSection(TokenOptions.SectionName))
            .PostConfigure(options =>
            {
                if (!string.IsNullOrWhiteSpace(fromEnvironment)) options.Key = fromEnvironment;
            })
            .Validate(
                options => Encoding.UTF8.GetByteCount(options.Key) >= 32,
                "No signing key. Set the SHIFTER_JWT_KEY environment variable to at "
                + "least 32 bytes of random data (openssl rand -base64 48).")
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
