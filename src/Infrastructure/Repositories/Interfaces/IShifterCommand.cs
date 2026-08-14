using Shifter.Domain.Entities;

namespace Shifter.Infrastructure.Repositories.Interfaces;

public interface IShifterCommand
{
    Task<bool> AddDayAsync(Day day, CancellationToken ct);
}