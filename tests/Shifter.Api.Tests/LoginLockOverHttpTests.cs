using System.Net;
using System.Net.Http.Json;

using Xunit;

namespace Shifter.Api.Tests;

/// <summary>
/// The door over real HTTP: five wrong passwords shut it for the right one
/// too, and a successful entry clears the slate. The clock's own arithmetic
/// is unit-tested where a fake clock is cheap; here the promise is that the
/// middleware, the handler and the header all say the same thing.
/// </summary>
[Collection("api")]
public sealed class LoginLockOverHttpTests
{
    private const string Password = "Integration1@x";

    private readonly Api _api;

    public LoginLockOverHttpTests(Api api)
    {
        _api = api;
    }

    private Task<HttpResponseMessage> KnockAsync(HttpClient client, string login, string password) =>
        client.PostAsJsonAsync("/shifter/v1/auth/user/login", new { login, password });

    [Fact]
    public async Task Five_misses_shut_the_door_even_for_the_right_password()
    {
        var signed = await _api.SignInAsync("lockme");
        var client = _api.CreateClient();

        for (var i = 0; i < 5; i++)
        {
            var miss = await KnockAsync(client, signed.Login, "WrongWrong1@");

            Assert.Equal(HttpStatusCode.Unauthorized, miss.StatusCode);
        }

        var shut = await KnockAsync(client, signed.Login, Password);

        Assert.Equal(HttpStatusCode.TooManyRequests, shut.StatusCode);
        Assert.True(shut.Headers.RetryAfter?.Delta > TimeSpan.Zero,
            "429 without a Retry-After is a door with no sign on it");

        // The lock is on that login, not on the world: a neighbour walks in.
        var neighbour = await _api.SignInAsync("bystander");

        Assert.NotNull(neighbour.Client.DefaultRequestHeaders.Authorization);
    }

    [Fact]
    public async Task A_successful_entry_clears_the_count()
    {
        var signed = await _api.SignInAsync("comeback");
        var client = _api.CreateClient();

        for (var round = 0; round < 2; round++)
        {
            for (var i = 0; i < 4; i++)
            {
                var miss = await KnockAsync(client, signed.Login, "WrongWrong1@");

                Assert.Equal(HttpStatusCode.Unauthorized, miss.StatusCode);
            }

            // Eight misses in total by the second round — but never five in a
            // row, because each right password wiped the slate.
            var entry = await KnockAsync(client, signed.Login, Password);

            Assert.Equal(HttpStatusCode.OK, entry.StatusCode);
        }
    }
}
