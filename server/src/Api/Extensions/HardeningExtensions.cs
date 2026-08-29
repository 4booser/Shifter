using System.Globalization;
using System.Threading.RateLimiting;
using Microsoft.AspNetCore.HttpOverrides;
using Microsoft.AspNetCore.RateLimiting;
using Shifter.Infrastructure.Persistence.DbContexts;

namespace Shifter.Api.Extensions;

/// <summary>
/// The things that keep the API standing up in public: a limit on how fast
/// credentials can be guessed, a health probe, and an explicit list of origins
/// allowed to call it from a browser.
/// </summary>
public static class HardeningExtensions
{
    /// <summary>Applied to the endpoints that accept or mint credentials.</summary>
    public const string AuthPolicy = "auth";

    /// <summary>Everything else, so one client cannot monopolise the server.</summary>
    public const string ApiPolicy = "api";

    /// <summary>
    /// Actions that hand somebody's phone number to a stranger, or take one.
    /// The general limit is sized for a calendar fanning out into parallel
    /// reads and is far too generous for these.
    /// </summary>
    public const string ContactPolicy = "contact";

    /// <summary>
    /// The assistant. Its ceiling is not about load — it is that a model call
    /// costs money, and an account that has asked forty questions in an hour
    /// is a loop, not a person.
    /// </summary>
    public const string AssistantPolicy = "assistant";

    /// <summary>
    /// Crash reports from the browser. Anonymous by necessity — a white screen
    /// can happen before anybody has logged in — so the ceiling has to assume
    /// the caller is hostile. A page that is genuinely broken sends a handful;
    /// anything past that is somebody using the log as a writing surface.
    /// </summary>
    public const string ClientErrorPolicy = "client-error";

    public const string CorsPolicy = "spa";

    public static IServiceCollection AddHardening(
        this IServiceCollection services,
        IConfiguration configuration)
    {
        // In production Caddy is the only thing that can reach the app: port
        // 8080 is not published, so the request always arrives from inside the
        // compose network. The default trust list is loopback only, which would
        // drop the headers from exactly that address — hence the clear. Nothing
        // untrusted can reach this port to forge them.
        services.Configure<ForwardedHeadersOptions>(options =>
        {
            options.ForwardedHeaders =
                ForwardedHeaders.XForwardedFor | ForwardedHeaders.XForwardedProto;

            options.KnownIPNetworks.Clear();
            options.KnownProxies.Clear();
        });

        services.AddRateLimiter(options =>
        {
            // 429 with a hint, in the same shape as every other error the API
            // produces, so the client can show it without a special case.
            options.RejectionStatusCode = StatusCodes.Status429TooManyRequests;

            options.OnRejected = async (context, ct) =>
            {
                if (context.Lease.TryGetMetadata(MetadataName.RetryAfter, out TimeSpan retryAfter))
                {
                    context.HttpContext.Response.Headers.RetryAfter =
                        ((int)retryAfter.TotalSeconds).ToString(CultureInfo.InvariantCulture);
                }

                await context.HttpContext.Response.WriteAsJsonAsync(
                    new
                    {
                        status = StatusCodes.Status429TooManyRequests,
                        error = "TooManyRequests",
                        message = "Too many attempts. Wait a moment and try again."
                    },
                    ct);
            };

            // Ten attempts a minute per address: no real person types a password
            // that often, and it makes a dictionary run pointless.
            options.AddPolicy(AuthPolicy, context => RateLimitPartition.GetFixedWindowLimiter(
                ClientKey(context),
                _ => new FixedWindowRateLimiterOptions
                {
                    PermitLimit = 10,
                    Window = TimeSpan.FromMinutes(1),
                    QueueLimit = 0
                }));

            // A burst big enough for a month view that fans out into several
            // parallel requests, refilled steadily after it. Configurable
            // because there is one thing that legitimately exceeds it — a
            // measurement writing years of days as fast as it can — and
            // because a deployment behind a shared address may need a
            // different number than one that is not.
            var burst = configuration.GetValue("RateLimits:ApiBurst", 120);
            var refill = configuration.GetValue("RateLimits:ApiPerPeriod", 30);

            options.AddPolicy(ApiPolicy, context => RateLimitPartition.GetTokenBucketLimiter(
                ClientKey(context),
                _ => new TokenBucketRateLimiterOptions
                {
                    TokenLimit = burst,
                    TokensPerPeriod = refill,
                    ReplenishmentPeriod = TimeSpan.FromSeconds(10),
                    QueueLimit = 0
                }));

            // Twenty an hour: answering twenty ads in an hour is already a
            // busy evening, and harvesting contacts at that rate is not.
            options.AddPolicy(ContactPolicy, context => RateLimitPartition.GetFixedWindowLimiter(
                ClientKey(context),
                _ => new FixedWindowRateLimiterOptions
                {
                    PermitLimit = 20,
                    Window = TimeSpan.FromHours(1),
                    QueueLimit = 0
                }));

            options.AddPolicy(ClientErrorPolicy, context => RateLimitPartition.GetFixedWindowLimiter(
                ClientKey(context),
                _ => new FixedWindowRateLimiterOptions
                {
                    PermitLimit = 10,
                    Window = TimeSpan.FromHours(1),
                    QueueLimit = 0
                }));

            options.AddPolicy(AssistantPolicy, context => RateLimitPartition.GetFixedWindowLimiter(
                ClientKey(context),
                _ => new FixedWindowRateLimiterOptions
                {
                    PermitLimit = 40,
                    Window = TimeSpan.FromHours(1),
                    QueueLimit = 0
                }));
        });

        string[] origins = configuration.GetSection("Cors:AllowedOrigins").Get<string[]>() ?? [];

        services.AddCors(options => options.AddPolicy(CorsPolicy, policy =>
        {
            // No origins configured means the SPA is served from this same
            // origin, which needs no CORS at all — so nothing is allowed rather
            // than everything.
            if (origins.Length == 0) return;

            policy
                .WithOrigins(origins)
                .AllowAnyHeader()
                .AllowAnyMethod();
        }));

        services.AddHealthChecks()
            .AddDbContextCheck<ShifterDbContext>("shifter-db")
            .AddDbContextCheck<TokensDbContext>("tokens-db");

        return services;
    }

    /// <summary>
    /// Signed-in callers are limited per account, everyone else per address, so
    /// one busy office network does not lock out its own staff.
    /// </summary>
    private static string ClientKey(HttpContext context)
    {
        string? user = context.User.Identity?.IsAuthenticated == true
            ? context.User.FindFirst(System.Security.Claims.ClaimTypes.NameIdentifier)?.Value
            : null;

        return user ?? context.Connection.RemoteIpAddress?.ToString() ?? "unknown";
    }
}
