using System.Text;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.IdentityModel.Tokens;
using Shifter.Application.Common.Options;

namespace Shifter.Api.Extensions;

public static class AuthenticationExtensions
{
    /// <summary>
    /// Registers the JWT bearer scheme. The validation parameters mirror what
    /// JwtService puts into the token; both sides read the same TokenOptions.
    /// </summary>
    public static IServiceCollection AddJwtAuthentication(
        this IServiceCollection services,
        IConfiguration configuration)
    {
        var tokenOptions = configuration
            .GetSection(TokenOptions.SectionName)
            .Get<TokenOptions>()
            ?? throw new InvalidOperationException("TokenOptions section is missing.");

        services
            .AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
            .AddJwtBearer(options =>
            {
                options.TokenValidationParameters = new TokenValidationParameters
                {
                    ValidateIssuer = true,
                    ValidIssuer = tokenOptions.Issuer,

                    ValidateAudience = true,
                    ValidAudience = tokenOptions.Audience,

                    ValidateIssuerSigningKey = true,
                    IssuerSigningKey = new SymmetricSecurityKey(
                        Encoding.UTF8.GetBytes(tokenOptions.Key)),

                    // Pinning the algorithm blocks tokens signed with anything
                    // other than the HMAC-SHA256 that JwtService issues.
                    ValidAlgorithms = [SecurityAlgorithms.HmacSha256],

                    ValidateLifetime = true,
                    ClockSkew = TimeSpan.FromSeconds(30)
                };

                // Without these the framework answers with an empty body; the
                // client would then see a 401 that looks nothing like every
                // other error GlobalExceptionMiddleware produces.
                options.Events = new JwtBearerEvents
                {
                    OnChallenge = async context =>
                    {
                        context.HandleResponse();

                        await WriteProblemAsync(
                            context.HttpContext,
                            StatusCodes.Status401Unauthorized,
                            "Unauthorized",
                            "A valid access token is required.");
                    },
                    OnForbidden = context => WriteProblemAsync(
                        context.HttpContext,
                        StatusCodes.Status403Forbidden,
                        "Forbidden",
                        "You are not allowed to access this resource.")
                };
            });

        services.AddAuthorization();

        return services;
    }

    private static Task WriteProblemAsync(
        HttpContext context,
        int statusCode,
        string error,
        string message)
    {
        context.Response.StatusCode = statusCode;

        return context.Response.WriteAsJsonAsync(new
        {
            status = statusCode,
            error,
            message
        });
    }
}
