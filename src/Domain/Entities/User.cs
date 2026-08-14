using System.ComponentModel.DataAnnotations;

namespace Shifter.Domain.Entities;

public sealed class User
{
    [Key]
    public int Id { get; set; }
    
    public required string FirstName { get; set; }
    public string? LastName { get; set; }
    
    public required string Login { get; set; }
    public required string PasswordHash { get; set; }
    
    public List<CalendarDay>? CalendarDays { get; set; }
    
    private bool IsActive { get; set; } = true;
    public DateTime CreatedAt { get; set; }
    public DateTime? LastLogin { get; set; }
}