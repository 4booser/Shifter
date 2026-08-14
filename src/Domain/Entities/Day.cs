namespace Shifter.Domain.Entities;

public sealed class Day
{
    public int Id { get; set; }
    public int UserId { get; set; }
    
    public List<Shift>? Shifts {get; set;}
    
    public int? Sales { get; set; }
    public decimal? Tips { get; set; }
    public string? Note { get; set; }
    
    public required DateOnly Date { get; set; }
}