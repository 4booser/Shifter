using System.ComponentModel.DataAnnotations;

namespace Shifter.Domain.Entities;

public sealed class JwtToken
{
    [Key]
    public int Id { get; set; }
    public required int UserId { get; set; }
    public required string Token { get; set; }
    public DateTime ExpiresAt { get; set; } = DateTime.UtcNow.AddDays(7);
}