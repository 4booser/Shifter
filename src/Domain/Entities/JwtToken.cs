namespace Shifter.Domain.Entities;

public class JwtToken
{
    public required string Token { get; set; }
    public DateTime ExpiresAt { get; set; } = DateTime.UtcNow.AddDays(7);
}