using Microsoft.OpenApi;
using Serilog;
using Shifter.Api.Extensions;
using Shifter.Api.Middlewares;
using Shifter.Application.Features;
using Shifter.Infrastructure;

// Running the built binary directly skips launchSettings.json, so the
// environment is whatever the shell happens to say — usually Production. A
// Debug build is a developer machine no matter what the variable claims, and
// that is the signal the local fallbacks key off. A Release build never gets
// them, so a real deployment still refuses to start half-configured.
#if DEBUG
const bool local = true;
#else
const bool local = false;
#endif

// Bootstrap logger: captures failures that happen before the host is built.
Log.Logger = new LoggerConfiguration()
    .WriteTo.Console()
    .CreateBootstrapLogger();

try
{
    var builder = WebApplication.CreateBuilder(args);

    builder.Services.AddSerilog((services, loggerConfiguration) => loggerConfiguration
        .ReadFrom.Configuration(builder.Configuration)
        .ReadFrom.Services(services));

    builder.Services.AddControllers();
    builder.Services.AddEndpointsApiExplorer();
    builder.Services.AddSwaggerGen(options =>
    {
        // Lets Swagger UI send the bearer token via its "Authorize" button.
        options.AddSecurityDefinition("Bearer", new OpenApiSecurityScheme
        {
            Name = "Authorization",
            Type = SecuritySchemeType.Http,
            Scheme = "bearer",
            BearerFormat = "JWT",
            In = ParameterLocation.Header,
            Description = "Paste the access_token returned by the auth endpoints."
        });

        options.AddSecurityRequirement(_ => new OpenApiSecurityRequirement
        {
            { new OpenApiSecuritySchemeReference("Bearer"), new List<string>() }
        });
    });
    builder.Services.AddApplication(builder.Configuration, local);
    builder.Services.AddHardening(builder.Configuration);
    builder.Services.AddJwtAuthentication();
    builder.Services.AddInfrastructure(
        builder.Configuration,
        local || builder.Environment.IsDevelopment());

    var app = builder.Build();

    // First in the pipeline: everything after it — the request log, the rate
    // limiter's per-address partition — reads the caller's address, and behind
    // the proxy that address is the proxy itself unless this runs first.
    app.UseForwardedHeaders();

    app.UseSerilogRequestLogging();

    app.UseMiddleware<GlobalExceptionMiddleware>();

    // Configure the HTTP request pipeline.
    if (app.Environment.IsDevelopment())
    {
        app.UseSwagger();
        app.UseSwaggerUI();
    }

    // No HTTPS redirection here, deliberately. In production the app never
    // speaks TLS: Caddy terminates it and forwards plain HTTP over a private
    // network, so a redirect from here either points at a port nothing listens
    // on (bare IP) or bounces the browser between the two forever (domain).
    // The edge already sends http to https on its own, which is where that
    // decision belongs.

    // Serves the exported Next.js bundle that `dotnet publish` builds into
    // wwwroot. In development the SPA is normally served by `next dev` instead.
    //
    // The export writes one file per route — dashboard.html, stats.html — and
    // browsers ask for /dashboard. Rewriting here, before the static files
    // middleware, is one rule instead of a directory convention per route.
    app.Use(async (context, next) =>
    {
        var path = context.Request.Path.Value ?? string.Empty;

        if (path.Length > 1
            && !path.StartsWith("/shifter/", StringComparison.Ordinal)
            && !Path.HasExtension(path))
        {
            var candidate = Path.Combine(
                app.Environment.WebRootPath ?? string.Empty,
                path.TrimStart('/') + ".html");

            if (File.Exists(candidate)) context.Request.Path = path + ".html";
        }

        await next();
    });

    app.UseDefaultFiles();
    app.UseStaticFiles();

    app.UseCors(HardeningExtensions.CorsPolicy);

    // Must sit between routing and the endpoints: authentication reads the
    // bearer token, authorization enforces [Authorize] on the matched endpoint.
    app.UseAuthentication();

    // After authentication, not before: the limiter partitions signed-in
    // callers by account, and the claims it reads only exist once the bearer
    // token has been validated. Validating a token is cheap next to the
    // handlers this protects.
    app.UseRateLimiter();

    app.UseAuthorization();

    app.MapControllers().RequireRateLimiting(HardeningExtensions.ApiPolicy);

    // Unauthenticated on purpose: a load balancer has no token to present.
    // It reports only whether each database answers, never why.
    app.MapHealthChecks("/health").AllowAnonymous();

    // SPA fallback: deep links such as /dashboard render the Angular shell so
    // they survive a refresh. Paths under shifter/ are excluded so that unknown
    // API routes still return 404 rather than a page of HTML.
    app.MapFallbackToFile("{*path:nonfile:regex(^(?!shifter/).*$)}", "index.html");

    app.Run();

    return 0;
}
catch (Exception exception) when (exception is not HostAbortedException)
{
    Log.Fatal(exception, "Shifter API terminated unexpectedly.");

    return 1;
}
finally
{
    Log.CloseAndFlush();
}
