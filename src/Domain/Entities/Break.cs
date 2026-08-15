namespace Shifter.Domain.Entities;

public sealed class Break
{
    public int Id { get; set; }
    public Shift? Shift { get; set; }
    
    public TimeSpan? Duration { get; set; }
    // or
    public TimeOnly? StartTime { get; set; }
    public TimeOnly? EndTime { get; set; }
}