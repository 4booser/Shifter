using System.ComponentModel.DataAnnotations;

namespace Shifter.Domain.Entities;

public sealed class Shift
{
    [Key]
    public int Id { get; set; }
    
    public required string Name { get; set; }
    
    public char? Symbol { get; set; }
    public decimal? SalaryPerHour { get; set; }
    public decimal? SalaryPerDay { get; set; }
    public decimal? SalaryPerWeek { get; set; }
    public decimal? SalaryPerMonth { get; set; }
    
    public required TimeOnly StartTime { get; set; }
    public required TimeOnly EndTime { get; set; }
    
    public Location? Location { get; set; }
    public List<Break>? Breaks { get; set; }
    
    private bool Archived { get; set; }
    
    public void ToArchive() => Archived = true;
}