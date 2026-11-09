using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using Shifter.Application.Common.Time;
using Shifter.Domain.Entities;
using Shifter.Infrastructure.Persistence.DbContexts;

namespace Shifter.Application.Features.business.Services;

/// <summary>Leaves one history line after a day is written, folding a burst of saves into the line it began.</summary>
public sealed class DayAuditWriter
{
    /// <summary>How long a line stays open to the next save from the same hand.</summary>
    private static readonly TimeSpan Burst = TimeSpan.FromMinutes(2);

    private readonly ShifterDbContext _db;
    private readonly ILogger<DayAuditWriter> _logger;
    private readonly AppClock _clock;

    public DayAuditWriter(ShifterDbContext db, ILogger<DayAuditWriter> logger, AppClock? clock = null)
    {
        _db = db;
        _logger = logger;
        _clock = clock ?? new AppClock();
    }

    public async Task WriteAsync(int userId, Day day, string source, CancellationToken ct)
    {
        try
        {
            DayAudit line = Line(userId, day, source);

            line.At = _clock.UtcNow;

            if (await FoldAsync(line, ct)) return;

            _db.DayAudits.Add(line);

            await _db.SaveChangesAsync(ct);
        }
        catch (Exception exception) when (exception is not OperationCanceledException)
        {
            _logger.LogWarning(exception, "Day audit write failed for {Date}", day.Date);
        }
    }

    /// <summary>Lays the line over the newest one from the same hand, where that one is still fresh.</summary>
    // The panel saves half a second after the last key and the history shows
    // the newest fifty lines, so appending would let one evening's typing push
    // everything real off the view. One statement, so nothing can land between
    // a read and the write.
    private async Task<bool> FoldAsync(DayAudit line, CancellationToken ct)
    {
        DateTime since = line.At - Burst;

        int folded = await _db.DayAudits
            .Where(audit => audit.At > since
                && audit.Id == _db.DayAudits
                    .Where(own => own.UserId == line.UserId
                        && own.Date == line.Date
                        && own.Source == line.Source)
                    .OrderByDescending(own => own.At)
                    .ThenByDescending(own => own.Id)
                    .Select(own => own.Id)
                    .FirstOrDefault())
            .ExecuteUpdateAsync(
                set => set
                    .SetProperty(audit => audit.At, line.At)
                    .SetProperty(audit => audit.ShiftCount, line.ShiftCount)
                    .SetProperty(audit => audit.WorkedCount, line.WorkedCount)
                    .SetProperty(audit => audit.Hours, line.Hours)
                    .SetProperty(audit => audit.Earned, line.Earned)
                    .SetProperty(audit => audit.Tips, line.Tips)
                    .SetProperty(audit => audit.SalesUnits, line.SalesUnits),
                ct);

        return folded > 0;
    }

    /// <summary>The line itself, for a writer with no request around it.</summary>
    public static DayAudit Line(int userId, Day day, string source)
    {
        var shifts = day.Shifts ?? [];

        return new DayAudit
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
        };
    }
}
