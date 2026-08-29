using Microsoft.EntityFrameworkCore;

using Shifter.Application.Features.business.Services;
using Shifter.Domain.Entities;

using Shifter.Infrastructure.Persistence.DbContexts;

namespace Shifter.Application.Features.Papers;

/// <summary>
/// The private chronicle: each place as a chapter, derived from the record.
///
/// The public CV already exists and is deliberately shaped for showing. This
/// is the other document — first day, last day, the rate at each end, what
/// the whole place came to — plus one field the record cannot derive: why it
/// ended, in the person's own words, for the person's own eyes.
///
/// It is the memory that makes the next negotiation honest. «Я уходил с 220»
/// is a sentence that needs a source, and two years later the app is the only
/// one left.
/// </summary>
public sealed class ChronicleService
{
    private readonly ShifterDbContext _db;

    public ChronicleService(ShifterDbContext db) => _db = db;

    public sealed record Chapter(
        int LocationId,
        string Name,
        string? FirstDay,
        string? LastDay,
        int DaysWorked,
        double Hours,
        decimal Earned,
        /// <summary>The hourly rate on the first and last worked placements that had one.</summary>
        decimal? RateFirst,
        decimal? RateLast,
        bool Current,
        string? PrivateNote);

    public async Task<Chapter[]> ReadAsync(int userId, CancellationToken ct)
    {
        var places = await _db.Locations.AsNoTracking()
            .Where(place => place.UserId == userId)
            .ToArrayAsync(ct);

        // Whole days rather than flat placements, because a chapter's
        // «earned» must include each place's share of weekly and monthly
        // wages — a salaried place summed per-day comes to zero, which is
        // exactly the lie the salary guard exists to catch.
        var days = await _db.Days.AsNoTracking()
            .Include(day => day.Shifts)!
            .ThenInclude(entry => entry.Shift)
            .Where(day => day.UserId == userId)
            .OrderBy(day => day.Date)
            .ToArrayAsync(ct);

        var periodWage = DayHandler.PeriodSalaryByPlace(days, workedOnly: true);

        var worked = days
            .SelectMany(day => (day.Shifts ?? [])
                .Where(entry => entry.Worked && entry.Shift?.LocationId != null)
                .Select(entry => new
                {
                    day.Date,
                    LocationId = entry.Shift!.LocationId!.Value,
                    Hours = entry.PaidDuration,
                    // Period wages come in once per period via the split
                    // above; letting the per-day zero through here would be
                    // fine, but excluding it keeps the intent readable.
                    Pay = entry.IsPeriodSalary ? 0m : entry.Pay,
                    entry.SalaryPeriod,
                    entry.SalaryAmount,
                }))
            .OrderBy(entry => entry.Date)
            .ToArray();

        var today = DateOnly.FromDateTime(DateTime.UtcNow);

        return places
            .Select(place =>
            {
                var theirs = worked
                    .Where(entry => entry.LocationId == place.Id)
                    .OrderBy(entry => entry.Date)
                    .ToArray();

                var hourly = theirs
                    .Where(entry => entry.SalaryPeriod == SalaryPeriod.Hour
                        && entry.SalaryAmount > 0)
                    .ToArray();

                return new Chapter(
                    place.Id,
                    place.Name,
                    theirs.FirstOrDefault()?.Date.ToString("yyyy-MM-dd"),
                    theirs.LastOrDefault()?.Date.ToString("yyyy-MM-dd"),
                    theirs.Select(entry => entry.Date).Distinct().Count(),
                    Math.Round(theirs.Sum(entry => entry.Hours.TotalHours), 1),
                    Math.Round(theirs.Sum(entry => entry.Pay)
                        + periodWage.GetValueOrDefault(place.Id), 2),
                    hourly.FirstOrDefault()?.SalaryAmount,
                    hourly.LastOrDefault()?.SalaryAmount,
                    // Current means worked within the last five weeks — a gap
                    // longer than any rota writes is the record's own way of
                    // saying it ended, whatever nobody bothered to close.
                    theirs.Length > 0 && theirs[^1].Date >= today.AddDays(-35),
                    place.PrivateNote);
            })
            .Where(chapter => chapter.DaysWorked > 0)
            .OrderByDescending(chapter => chapter.LastDay)
            .ToArray();
    }

    public async Task NoteAsync(int userId, int locationId, string? note, CancellationToken ct)
    {
        var place = await _db.Locations
            .FirstOrDefaultAsync(row => row.Id == locationId && row.UserId == userId, ct)
            ?? throw new Application.Common.Exceptions.NotFoundException("No such place.");

        place.PrivateNote = string.IsNullOrWhiteSpace(note)
            ? null
            : note.Trim()[..Math.Min(500, note.Trim().Length)];

        await _db.SaveChangesAsync(ct);
    }
}
