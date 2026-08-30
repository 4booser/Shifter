using System.Net.Http.Json;
using System.Text.Json;

using Xunit;

namespace Shifter.Api.Tests;

/// <summary>
/// The words a person reads at the worst moment now travel with a machine
/// name, so each client can say them in its reader's language. The English
/// sentence stays in the envelope as the fallback and the log's truth.
/// </summary>
[Collection("api")]
public sealed class ErrorCodesOverHttpTests
{
    private readonly Api _api;

    public ErrorCodesOverHttpTests(Api api)
    {
        _api = api;
    }

    [Fact]
    public async Task A_wrong_password_answers_with_its_code()
    {
        var signed = await _api.SignInAsync("coded");
        var anonymous = _api.CreateClient();

        var miss = await anonymous.PostAsJsonAsync(
            "/shifter/v1/auth/user/login", new { login = signed.Login, password = "WrongWrong1@" });
        var body = await miss.Content.ReadFromJsonAsync<JsonElement>();

        Assert.Equal("auth.invalid", body.GetProperty("code").GetString());
    }

    [Fact]
    public async Task The_shut_door_answers_auth_locked()
    {
        var signed = await _api.SignInAsync("codedlock");
        var anonymous = _api.CreateClient();

        for (var i = 0; i < 5; i++)
            await anonymous.PostAsJsonAsync(
                "/shifter/v1/auth/user/login", new { login = signed.Login, password = "WrongWrong1@" });

        var shut = await anonymous.PostAsJsonAsync(
            "/shifter/v1/auth/user/login", new { login = signed.Login, password = "WrongWrong1@" });
        var body = await shut.Content.ReadFromJsonAsync<JsonElement>();

        Assert.Equal("auth.locked", body.GetProperty("code").GetString());
    }

    [Fact]
    public async Task A_wrong_current_password_answers_auth_current()
    {
        var signed = await _api.SignInAsync("codedpw");

        var miss = await signed.Client.PutAsJsonAsync(
            "/shifter/v1/account/password",
            new { current_password = "NotItAtAll1@", new_password = "Fresh1@xxxx" });
        var body = await miss.Content.ReadFromJsonAsync<JsonElement>();

        Assert.Equal("auth.current", body.GetProperty("code").GetString());
    }

    [Fact]
    public async Task An_uncoded_error_sends_null_not_a_missing_field()
    {
        var anonymous = _api.CreateClient();

        var refused = await anonymous.PostAsJsonAsync(
            "/shifter/v1/auth/user/login", new { login = "ab", password = "short" });
        var body = await refused.Content.ReadFromJsonAsync<JsonElement>();

        // The field is part of the envelope now: absent would make clients
        // branch on shape instead of value.
        Assert.True(body.TryGetProperty("code", out var code));
        Assert.Equal(JsonValueKind.Null, code.ValueKind);
    }
}
