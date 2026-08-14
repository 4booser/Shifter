using System.ComponentModel.DataAnnotations;

namespace Shifter.Domain.Entities;

public sealed class Location
{
    [Key]
    private int Id { get; set; }
    
    public required string Name { get; set; }
    
    public required string Address { get; set; }
}