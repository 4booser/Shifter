namespace Shifter.Domain.Entities;

public class Sales
{
    public int Id { get; set; }
    
    public required string Name { get; set; }
    public required decimal Price { get; set; }
}