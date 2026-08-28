using System.Reflection;
using System.Text;
using Shifter.Application.Common.Options;
using Shifter.Application.Features.Auth.Services;
using Shifter.Application.Features.Auth.Services.Interfaces;
using Shifter.Application.Features.business.Services;
using Shifter.Application.Features.business.Services.Interfaces;
using Shifter.Application.Features.Push;
using Shifter.Application.Features.Webhooks.Services;
using Shifter.Application.Features.Webhooks.Services.Interfaces;

// System.EventHandler is a delegate that every file gets through the implicit
// usings, and an unqualified EventHandler here means neither of them.
using EventHandler = Shifter.Application.Features.business.Services.EventHandler;

namespace Shifter.Application.Features;

public static class DependencyInjection
{
    /// <summary>
    /// Only ever used by a Debug build with nothing configured. Fixed rather
    /// than random so that a restart does not invalidate the token sitting in
    /// the browser from a minute ago.
    /// </summary>
    private const string LocalKey = "shifter-local-development-key-not-for-any-real-use";

    public static IServiceCollection AddApplication(
        this IServiceCollection services,
        IConfiguration configuration,
        bool allowLocalKey = false)
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
                if (!string.IsNullOrWhiteSpace(fromEnvironment))
                {
                    options.Key = fromEnvironment;

                    return;
                }

                if (!string.IsNullOrWhiteSpace(options.Key) || !allowLocalKey) return;

                Serilog.Log.Warning(
                    "No signing key configured; using the built-in development key. "
                    + "Set SHIFTER_JWT_KEY before this runs anywhere but your own machine.");

                options.Key = LocalKey;
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

        // Web push: options may be empty, in which case the sender reports
        // itself disabled and the scheduler exits without a single pass.
        services.Configure<PushOptions>(configuration.GetSection(PushOptions.Section));

        // Photo import: same contract — no key, no feature, no crash.
        services.Configure<Shifter.Application.Features.Import.ImportOptions>(
            configuration.GetSection(Shifter.Application.Features.Import.ImportOptions.Section));
        services.AddHttpClient();
        services.AddHttpContextAccessor();
        services.AddSingleton<Shifter.Application.Features.Import.PhotoImportService>();
        services.AddSingleton<PushSender>();
        services.AddScoped<ExpoPushSender>();
        services.AddScoped<IPushNotifier, PushNotifier>();
        services.AddScoped<Shifter.Application.Features.Auth.Services.TwoFactorService>();

        services.Configure<Shifter.Application.Features.Telegram.TelegramOptions>(
            configuration.GetSection(Shifter.Application.Features.Telegram.TelegramOptions.Section));
        services.AddSingleton<Shifter.Application.Features.Telegram.TelegramBotService>();
        services.AddHostedService(provider =>
            provider.GetRequiredService<Shifter.Application.Features.Telegram.TelegramBotService>());
        services.AddScoped<Shifter.Application.Features.Teams.Services.PlannerService>();
        services.AddScoped<Shifter.Application.Features.Teams.Services.SwapService>();
        services.Configure<Shifter.Application.Features.Brief.BriefOptions>(
            configuration.GetSection(Shifter.Application.Features.Brief.BriefOptions.Section));
        services.AddScoped<Shifter.Application.Features.Brief.GeminiBriefClient>();
        services.AddScoped<Shifter.Application.Features.Brief.BriefService>();
        services.AddScoped<Shifter.Application.Features.Assistant.GeminiAssistantClient>();
        services.AddScoped<Shifter.Application.Features.Assistant.AssistantService>();
        services.AddScoped<Shifter.Application.Features.Money.NbuRateClient>();
        services.AddScoped<Shifter.Application.Features.Weather.OpenMeteoClient>();
        services.AddScoped<Shifter.Application.Features.Weather.WeatherService>();
        services.AddScoped<Shifter.Application.Features.Money.RateService>();
        services.AddScoped<Shifter.Application.Features.business.Services.DayAuditWriter>();
        services.AddScoped<Shifter.Application.Features.business.Services.GoalCelebrator>();
        services.AddScoped<Shifter.Application.Features.Gigs.GigService>();
        services.Configure<Shifter.Application.Features.Mail.MailOptions>(
            configuration.GetSection(Shifter.Application.Features.Mail.MailOptions.Section));
        services.AddScoped<Shifter.Application.Features.Mail.MailSender>();
        services.AddScoped<Shifter.Application.Features.Auth.Services.PasswordResetService>();
        services.AddHostedService<PushScheduler>();
        services.AddSingleton<IHasher, Hasher>();
        services.AddScoped<IAuthTokenIssuer, AuthTokenIssuer>();

        // One clock for the whole app, so "today" means the same thing in the
        // reconciliation, the rate history and a place's current pay period.
        services.AddSingleton(new Shifter.Application.Common.Time.AppClock(
            configuration["App:TimeZone"]));

        services.AddScoped<IShiftHandler, ShiftHandler>();
        services.AddScoped<ISalesHandler, SalesHandler>();
        services.AddScoped<IDayHandler, DayHandler>();
        services.AddScoped<IPayoutHandler, PayoutHandler>();
        services.AddScoped<IExpenseHandler, ExpenseHandler>();
        services.AddScoped<DocumentHandler>();
        services.AddScoped<Shifter.Application.Features.Gigs.UrgentAlerts>();
        services.AddScoped<IGoalHandler, GoalHandler>();
        services.AddScoped<ILocationHandler, LocationHandler>();
        services.AddScoped<IReconciliationHandler, ReconciliationHandler>();
        services.AddScoped<IEventHandler, EventHandler>();
        services.AddScoped<IEventTemplateHandler, EventTemplateHandler>();

        services.AddScoped<IWebhookHandler, WebhookHandler>();
        services.AddScoped<IWebhookIngestHandler, WebhookIngestHandler>();

        return services;
    }
}
