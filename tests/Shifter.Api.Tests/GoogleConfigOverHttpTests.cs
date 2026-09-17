using System.Net.Http.Json;
using System.Text.Json;

using Xunit;

namespace Shifter.Api.Tests;

/// <summary>The phone renders its Google button only for a client id the server actually vouches for.</summary>
[Collection("api")]
public sealed class GoogleConfigOverHttpTests(Api api)
{
    [Fact]
    public async Task Config_names_every_platform_and_nulls_the_unset_one()
    {
        var response = await api.CreateClient().GetAsync("/shifter/v1/auth/google/config");

        response.EnsureSuccessStatusCode();

        var body = await response.Content.ReadFromJsonAsync<JsonElement>();

        Assert.False(string.IsNullOrEmpty(body.GetProperty("client_id").GetString()));
        Assert.Equal("ios-tests.apps.googleusercontent.com", body.GetProperty("ios_client_id").GetString());
        Assert.Equal(JsonValueKind.Null, body.GetProperty("android_client_id").ValueKind);
    }
}
