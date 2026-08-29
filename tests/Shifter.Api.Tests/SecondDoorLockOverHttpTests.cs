using System.Net;
using System.Net.Http.Json;
using System.Text.Json;

using Shifter.Application.Features.Auth.Services;

using Xunit;

namespace Shifter.Api.Tests;

/// <summary>
/// The doors behind the front door. Wave 53 locked the login; that alone
/// makes the 2FA code and the change-password check the interesting targets —
/// one can be guessed for as long as tickets can be minted, the other is an
/// oracle for whoever already stole an access token.
/// </summary>
[Collection("api")]
public sealed class SecondDoorLockOverHttpTests
{
    private const string Password = "Integration1@x";

    private readonly Api _api;

    public SecondDoorLockOverHttpTests(Api api)
    {
        _api = api;
    }

    private static string CodeFor(string secret) =>
        Totp.Compute(secret, DateTimeOffset.UtcNow.ToUnixTimeSeconds() / 30);

    [Fact]
    public async Task Five_wrong_codes_shut_the_second_door_even_for_the_true_code()
    {
        var signed = await _api.SignInAsync("secondlock");

        var setup = await signed.Client.PostAsync("/shifter/v1/auth/2fa/setup", null);
        var secret = (await setup.Content.ReadFromJsonAsync<JsonElement>())
            .GetProperty("secret").GetString()!;

        var enabled = await signed.Client.PostAsJsonAsync(
            "/shifter/v1/auth/2fa/enable", new { code = CodeFor(secret) });

        Assert.Equal(HttpStatusCode.OK, enabled.StatusCode);

        // The password half; it hands over a ticket instead of tokens now.
        var anonymous = _api.CreateClient();
        var challenge = await anonymous.PostAsJsonAsync(
            "/shifter/v1/auth/user/login", new { login = signed.Login, password = Password });
        var ticket = (await challenge.Content.ReadFromJsonAsync<JsonElement>())
            .GetProperty("ticket").GetString()!;

        for (var i = 0; i < 5; i++)
        {
            var miss = await anonymous.PostAsJsonAsync(
                "/shifter/v1/auth/user/login/2fa", new { ticket, code = "000000" });

            Assert.Equal(HttpStatusCode.Unauthorized, miss.StatusCode);
        }

        var shut = await anonymous.PostAsJsonAsync(
            "/shifter/v1/auth/user/login/2fa", new { ticket, code = CodeFor(secret) });

        Assert.Equal(HttpStatusCode.TooManyRequests, shut.StatusCode);

        // A fresh ticket does not reopen it: the lock follows the account,
        // not the ticket — or minting tickets would reset the count.
        var again = await anonymous.PostAsJsonAsync(
            "/shifter/v1/auth/user/login", new { login = signed.Login, password = Password });
        var freshTicket = (await again.Content.ReadFromJsonAsync<JsonElement>())
            .GetProperty("ticket").GetString()!;
        var stillShut = await anonymous.PostAsJsonAsync(
            "/shifter/v1/auth/user/login/2fa", new { ticket = freshTicket, code = CodeFor(secret) });

        Assert.Equal(HttpStatusCode.TooManyRequests, stillShut.StatusCode);
    }

    [Fact]
    public async Task Guessing_the_current_password_from_a_stolen_token_hits_a_wall()
    {
        var signed = await _api.SignInAsync("oracle");

        for (var i = 0; i < 5; i++)
        {
            var miss = await signed.Client.PutAsJsonAsync(
                "/shifter/v1/account/password",
                new { current_password = $"NotIt{i}aaaa@", new_password = "Fresh1@xxxx" });

            Assert.Equal(HttpStatusCode.Unauthorized, miss.StatusCode);
        }

        var shut = await signed.Client.PutAsJsonAsync(
            "/shifter/v1/account/password",
            new { current_password = Password, new_password = "Fresh1@xxxx" });

        Assert.Equal(HttpStatusCode.TooManyRequests, shut.StatusCode);
    }
}
