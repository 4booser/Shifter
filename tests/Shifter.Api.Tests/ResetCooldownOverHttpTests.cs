using System.Net;
using System.Net.Http.Json;
using System.Text.Json;

using Xunit;

namespace Shifter.Api.Tests;

/// <summary>
/// The forgot-password form is the last anonymous door, and it sends mail.
/// The promise here: a second ask inside ten minutes sends nothing new and
/// betrays nothing — while the first letter keeps working.
/// </summary>
[Collection("api")]
public sealed class ResetCooldownOverHttpTests
{
    private readonly Api _api;

    public ResetCooldownOverHttpTests(Api api)
    {
        _api = api;
    }

    [Fact]
    public async Task A_second_ask_inside_the_window_sends_nothing_and_the_first_letter_still_works()
    {
        var signed = await _api.SignInAsync("mailguard");
        var email = $"{signed.Login}@example.test";

        // The address has to be on the account before the form can find it.
        var attach = await signed.Client.PutAsJsonAsync(
            "/shifter/v1/account/avatar/email", new { email });

        Assert.Equal(HttpStatusCode.OK, attach.StatusCode);

        var anonymous = _api.CreateClient();

        var first = await anonymous.PostAsJsonAsync(
            "/shifter/v1/auth/password/forgot", new { email });
        var firstBody = await first.Content.ReadFromJsonAsync<JsonElement>();

        Assert.Equal(HttpStatusCode.Accepted, first.StatusCode);
        Assert.True(firstBody.TryGetProperty("dev_token", out var token),
            "dev reveals the token; without it this test cannot see the letter");

        var second = await anonymous.PostAsJsonAsync(
            "/shifter/v1/auth/password/forgot", new { email });
        var secondBody = await second.Content.ReadFromJsonAsync<JsonElement>();

        // Same 202, no token: the caller cannot tell a cooled-down address
        // from an unknown one.
        Assert.Equal(HttpStatusCode.Accepted, second.StatusCode);
        Assert.False(secondBody.TryGetProperty("dev_token", out _));

        // The first letter was not invalidated by the swallowed second ask.
        var redeem = await anonymous.PostAsJsonAsync(
            "/shifter/v1/auth/password/reset",
            new { token = token.GetString(), password = "Fresh1@xxxx" });

        Assert.Equal(HttpStatusCode.NoContent, redeem.StatusCode);
    }
}
