using Microsoft.EntityFrameworkCore;
using Shifter.Infrastructure.Persistence.DbContexts;
using Shifter.Infrastructure.Repositories.Commands;
using Shifter.Infrastructure.Repositories.Interfaces;

namespace Shifter.Infrastructure;

public static class DependencyInjection
{
    public static IServiceCollection AddInfrastructure(
        this IServiceCollection services,
        IConfiguration configuration)
    {
        var shifterDb = configuration.GetConnectionString("Shifter")
                         ?? throw new InvalidOperationException("Connection string 'Shifter' is missing.");
        
        services.AddDbContext<ShifterDbContext>(options =>
            options.UseNpgsql(shifterDb));

        services.AddScoped<IUserCommand, UserCommand>();
        
        return services;
    }
}