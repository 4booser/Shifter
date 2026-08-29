using Microsoft.EntityFrameworkCore;
using Shifter.Infrastructure.Persistence.DbContexts;
using Shifter.Infrastructure.Repositories.Commands;
using Shifter.Infrastructure.Repositories.Interfaces;
using Shifter.Infrastructure.Repositories.Queries;

namespace Shifter.Infrastructure;

public static class DependencyInjection
{
    /// <summary>Where a local database lives when nobody has said otherwise.</summary>
    private const string LocalTemplate =
        "Host=localhost;Port=5432;Database={0};Username=shifter_user;Password=0000";

    public static IServiceCollection AddInfrastructure(
        this IServiceCollection services,
        IConfiguration configuration,
        bool isDevelopment)
    {
        // Credentials are not committed: outside development these arrive as
        // ConnectionStrings__Shifter and ConnectionStrings__Tokens.
        //
        // In development a missing value falls back to localhost instead of
        // refusing to start. Running the built binary directly skips
        // launchSettings.json, so the environment is whatever the shell says —
        // and failing to boot over a database that was always going to be on
        // localhost helps nobody. In production it still throws: a server
        // quietly talking to its own loopback is a far worse outcome.
        var shifterDb = configuration.GetConnectionString("Shifter")
                        ?? Fallback("shifter", isDevelopment, "Shifter");

        var tokenDb = configuration.GetConnectionString("Tokens")
                        ?? Fallback("tokens", isDevelopment, "Tokens");
        
        // Two contexts at Npgsql's default of a hundred connections each is
        // two hundred against a Postgres that allows a hundred in total — so a
        // burst answered "sorry, too many clients already", which also failed
        // the health probes. Bounded, and told to ride out a blip rather than
        // surface it as a 500.
        // The counter rides inside the options: there is no registration
        // order to get wrong, which is how the last one reported zero.
        services.AddDbContext<ShifterDbContext>(options =>
            options.UseNpgsql(shifterDb, Tuning).AddInterceptors(new QueryCounter()));

        services.AddDbContext<TokensDbContext>(options =>
            options.UseNpgsql(tokenDb, Tuning).AddInterceptors(new QueryCounter()));

        services.AddScoped<IUserCommand, UserCommand>();
        services.AddScoped<IUserQuery, UserQuery>();

        services.AddScoped<ITokenCommand, TokenCommand>();
        services.AddScoped<ITokenQuery, TokenQuery>();
        
        services.AddScoped<IShifterCommand, ShifterCommand>();
        services.AddScoped<IShifterQuery, ShifterQuery>();
        services.AddScoped<ITeamRepository, TeamRepository>();
        services.AddScoped<IWebhookRepository, WebhookRepository>();
        
        return services;
    }

    private static string Fallback(string database, bool isDevelopment, string name)
    {
        if (!isDevelopment)
        {
            throw new InvalidOperationException(
                $"No '{name}' connection string. Set ConnectionStrings__{name}.");
        }

        Serilog.Log.Warning(
            "No '{Name}' connection string configured; falling back to localhost/{Database}. "
            + "Set ConnectionStrings__{Name} to point somewhere else.",
            name,
            database);

        return string.Format(LocalTemplate, database);
    }

    /// <summary>
    /// What each context is allowed to take from the database, and how it
    /// behaves when the connection wobbles. Thirty apiece leaves headroom on a
    /// hundred-connection server for the migration job and for a person with
    /// psql open.
    /// </summary>
    private static void Tuning(Npgsql.EntityFrameworkCore.PostgreSQL.Infrastructure.NpgsqlDbContextOptionsBuilder options)
    {
        options.MaxBatchSize(100);
        options.CommandTimeout(30);
        options.EnableRetryOnFailure(3, TimeSpan.FromSeconds(2), null);
    }
}
