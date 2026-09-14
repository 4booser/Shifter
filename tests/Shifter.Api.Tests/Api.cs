using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;

using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;

using Npgsql;

using Shifter.Infrastructure.Persistence.DbContexts;

using Xunit;

namespace Shifter.Api.Tests;

/// <summary>The real application, over real HTTP, against a real Postgres.</summary>
public sealed class Api : WebApplicationFactory<Program>, IAsyncLifetime
{
    /// <summary>A schema of its own inside the development database.</summary>
    private const string Schema = "e2e";

    private static readonly string Base =
        Environment.GetEnvironmentVariable("ConnectionStrings__Shifter")
        ?? "Host=localhost;Port=5432;Database=shifter;Username=shifter_user;Password=shifter_pass";

    private static string Connection(string schema) =>
        new NpgsqlConnectionStringBuilder(Base) { SearchPath = schema }.ConnectionString;

    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        builder.UseEnvironment(Environments.Development);

        builder.UseSetting("ConnectionStrings:Shifter", Connection(Schema));
        builder.UseSetting("ConnectionStrings:Tokens", Connection(Schema));

        // A signing key, so the host does not refuse to start and so tokens
        // from one run cannot be used against another.
        builder.UseSetting("Jwt:Key", "integration-tests-key-thirty-two-chars!!");

        // The limiter is right for a person and wrong for a measurement that
        // writes three years of days as fast as it can. Raised here and
        // nowhere else — its own behaviour is tested separately.
        builder.UseSetting("RateLimits:ApiBurst", "100000");
        builder.UseSetting("RateLimits:ApiPerPeriod", "100000");

    }

    public async ValueTask InitializeAsync()
    {
        await using (var admin = new NpgsqlConnection(Base))
        {
            await admin.OpenAsync();

            // Dropped and remade rather than migrated forward: the point is to
            // watch the whole history apply to an empty schema, which is what
            // a deployment does and what nothing else here checks.
            await using var reset = new NpgsqlCommand(
                $"DROP SCHEMA IF EXISTS {Schema} CASCADE; CREATE SCHEMA {Schema};", admin);

            await reset.ExecuteNonQueryAsync();
        }

        using var scope = Services.CreateScope();

        await scope.ServiceProvider.GetRequiredService<ShifterDbContext>().Database.MigrateAsync();
        await scope.ServiceProvider.GetRequiredService<TokensDbContext>().Database.MigrateAsync();
    }

    public override async ValueTask DisposeAsync()
    {
        await base.DisposeAsync();
    }

    /// <summary>A signed-in client with an account of its own.</summary>
    public async Task<Signed> SignInAsync(string who)
    {
        var client = CreateClient();
        var login = $"{who}{Random.Shared.Next(100_000, 999_999)}";

        var registered = await client.PostAsJsonAsync(
            "/shifter/v1/auth/user/register",
            new { login, password = "Integration1@x", first_name = "Тест", last_name = "Тестов" });

        if (!registered.IsSuccessStatusCode)
            throw new Exception($"register: {await registered.Content.ReadAsStringAsync()}");

        var response = await client.PostAsJsonAsync(
            "/shifter/v1/auth/user/login", new { login, password = "Integration1@x" });

        if (!response.IsSuccessStatusCode)
            throw new Exception($"login: {await response.Content.ReadAsStringAsync()}");

        var token = (await response.Content.ReadFromJsonAsync<JsonElement>())
            .GetProperty("access_token").GetString();

        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", token);

        return new Signed(client, login);
    }

    public sealed record Signed(HttpClient Client, string Login);
}

/// <summary>One host for the whole run: booting it per test costs seconds each.</summary>
[CollectionDefinition("api")]
public sealed class ApiCollection : ICollectionFixture<Api>;