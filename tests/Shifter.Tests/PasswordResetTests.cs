using Shifter.Application.Features.Auth.Services;

using Xunit;

namespace Shifter.Tests;

public class PasswordResetTests
{
    [Fact]
    public void A_token_is_long_random_hex()
    {
        var token = PasswordResetService.NewToken();

        Assert.Equal(64, token.Length);
        Assert.Matches("^[0-9a-f]+$", token);
        Assert.NotEqual(token, PasswordResetService.NewToken());
    }

    [Fact]
    public void Only_the_hash_is_ever_stored_and_it_is_stable()
    {
        const string token = "0123456789abcdef";
        var hash = PasswordResetService.HashToken(token);

        Assert.Equal(64, hash.Length);
        Assert.DoesNotContain(token, hash);
        Assert.Equal(hash, PasswordResetService.HashToken(token));
        Assert.NotEqual(hash, PasswordResetService.HashToken("0123456789abcdee"));
    }
}
