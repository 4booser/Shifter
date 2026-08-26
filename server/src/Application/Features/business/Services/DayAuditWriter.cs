using Microsoft.Extensions.Logging;
using Shifter.Domain.Entities;
using Shifter.Infrastructure.Persistence.DbContexts;

namespace Shifter.Application.Features.business.Services;

/// <summary>
/// Appends one history line after a day is written. Failures are logged and
/// swallowed: history is a courtesy, and no save should ever die for it.
/// </summary>
public sealed class DayAuditWriter
{
    private readonly ShifterDbContext _db;
    private readonly ILogger<DayAuditWriter> _logger;

    public DayAuditWriter(ShifterDbContext db, ILogger<DayAuditWriter> logger)
    {
        _db = db;
        _logger = logger;
    }

    public async Task WriteAsync(int userId, Day day, string source, CancellationToken ct)
    {
        try
        {
            var shifts = day.Shifts ?? [];

            _db.DayAudits.Add(new DayAudit
            {
                UserId = userId,
                Date = day.Date,
                Source = source,
                ShiftCount = shifts.Count,
                WorkedCount = shifts.Count(entry => entry.Worked),
                Hours = Math.Round(shifts.Where(entry => entry.Worked).Sum(entry => entry.PaidDuration.TotalHours), 2),
                Earned = shifts.Where(entry => entry.Worked).Sum(entry => entry.Pay),
                Tips = day.Tips ?? 0m,
                SalesUnits = (day.Sales ?? []).Sum(sale => sale.Quantity),
            });

            await _db.SaveChangesAsync(ct);
        }
        catch (Exception exception) when (exception is not OperationCanceledException)
        {
            _logger.LogWarning(exception, "Day audit write failed for {Date}", day.Date);
        }
    }
}
