using Microsoft.EntityFrameworkCore;
using Shifter.Infrastructure.Persistence.DbContexts;
using Shifter.Infrastructure.Repositories.Commands;
using Shifter.Infrastructure.Repositories.Interfaces;
using Shifter.Infrastructure.Repositories.Queries;

namespace Shifter.Infrastructure;

public static class DependencyInjection
{
    public static IServiceCollection AddInfrastructure(
        this IServiceCollection services,
        IConfiguration configuration)
    {
        // Credentials are not committed: outside development these arrive as
        // ConnectionStrings__Shifter and ConnectionStrings__Tokens.
        var shifterDb = configuration.GetConnectionString("Shifter")
                        ?? throw new InvalidOperationException(
                            "No 'Shifter' connection string. Set ConnectionStrings__Shifter.");

        var tokenDb = configuration.GetConnectionString("Tokens")
                        ?? throw new InvalidOperationException(
                            "No 'Tokens' connection string. Set ConnectionStrings__Tokens.");
        
        services.AddDbContext<ShifterDbContext>(options =>
            options.UseNpgsql(shifterDb));

        services.AddDbContext<TokensDbContext>(options =>
            options.UseNpgsql(tokenDb));

        services.AddScoped<IUserCommand, UserCommand>();
        services.AddScoped<IUserQuery, UserQuery>();

        services.AddScoped<ITokenCommand, TokenCommand>();
        services.AddScoped<ITokenQuery, TokenQuery>();
        
        services.AddScoped<IShifterCommand, ShifterCommand>();
        services.AddScoped<IShifterQuery, ShifterQuery>();
        
        return services;
    }
}