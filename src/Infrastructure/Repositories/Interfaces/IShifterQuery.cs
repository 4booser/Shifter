using Shifter.Domain.Entities;

namespace Shifter.Infrastructure.Repositories.Interfaces;

public interface IShifterQuery
{
    Task<Day[]> GetDaysByUserIdAsync(int userId, CancellationToken ct);
    Task<Day?> GetDayByIdAsync(int id, CancellationToken ct);
    Task<Shift?> GetShiftByIdAsync(int id, CancellationToken ct);
}