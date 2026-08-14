namespace Shifter.Domain.Entities;

public class CalendarDay
{
    public int Id { get; set; }
    
    public List<Shift>? Shifts {get; set;}
    public List<Sales>? Sales {get; set;}
    
    public decimal? Tips { get; set; }
    public string? Note { get; set; }
    
    public required DateTime Date { get; set; }
}