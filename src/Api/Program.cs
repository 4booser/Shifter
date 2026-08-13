using Microsoft.OpenApi;
using Serilog;
using Shifter.Api.Extensions;
using Shifter.Api.Middlewares;
using Shifter.Application.Features;
using Shifter.Infrastructure;

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
    builder.Services.AddApplication(builder.Configuration);
    builder.Services.AddJwtAuthentication(builder.Configuration);
    builder.Services.AddInfrastructure(builder.Configuration);

    var app = builder.Build();

    app.UseSerilogRequestLogging();

    app.UseMiddleware<GlobalExceptionMiddleware>();

    // Configure the HTTP request pipeline.
    if (app.Environment.IsDevelopment())
    {
        app.UseSwagger();
        app.UseSwaggerUI();
    }

    app.UseHttpsRedirection();

    // Serves the Angular bundle that `dotnet publish` builds into wwwroot.
    // In development the SPA is normally served by `ng serve` instead.
    app.UseDefaultFiles();
    app.UseStaticFiles();

    // Must sit between routing and the endpoints: authentication reads the
    // bearer token, authorization enforces [Authorize] on the matched endpoint.
    app.UseAuthentication();
    app.UseAuthorization();

    app.MapControllers();

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
