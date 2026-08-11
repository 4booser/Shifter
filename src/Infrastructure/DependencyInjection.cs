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
        var shifterDb = configuration.GetConnectionString("Shifter") 
                        ?? throw new InvalidOperationException("Connection string 'Shifter' is missing.");
        
        var tokenDb = configuration.GetConnectionString("Tokens")
                        ?? throw new InvalidOperationException("Connection string 'Tokens' is missing.");
        
        services.AddDbContext<ShifterDbContext>(options =>
            options.UseNpgsql(shifterDb));

        services.AddDbContext<TokensDbContext>(options =>
            options.UseNpgsql(tokenDb));

        services.AddScoped<IUserCommand, UserCommand>();
        services.AddScoped<IUserQuery, UserQuery>();

        services.AddScoped<ITokenCommand, TokenCommand>();
        
        return services;
    }
}