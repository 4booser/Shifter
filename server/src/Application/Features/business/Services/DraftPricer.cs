using Microsoft.EntityFrameworkCore;

using Shifter.Application.Common.Exceptions;
using Shifter.Domain.Entities;
using Shifter.Infrastructure.Persistence.DbContexts;

namespace Shifter.Application.Features.business.Services;

/// <summary>
/// «Если возьму эти смены» — a week priced before anybody commits to it.
///
/// The one calculation people do in their heads before agreeing to a
/// подработка, and the head gets it wrong in exactly one place: the fifth
/// shift of a week does not pay what the first four did, because somewhere in
/// it the overtime line is crossed. That crossing depends on the real shifts
/// already worked that week, so a client cannot price a draft honestly — only
/// the server holds both halves.
///
/// Nothing is written. The synthetic days live for one request, priced by the
/// same static arithmetic the calendar itself uses — the whole point is that
/// the draft and the eventual reality cannot disagree.
/// </summary>
public sealed class DraftPricer
{
    private readonly ShifterDbContext _db;

    public DraftPricer(ShifterDbContext db) => _db = db;

    public sealed record Priced(
        decimal Base,
        double Hours,
        /// <summary>The premium the draft adds, given the real week around it.</summary>
        decimal OvertimeExtra,
        double OvertimeHours,
        decimal Total);

    public async Task<Priced> PriceAsync(
        int userId, int shiftId, DateOnly[] dates, CancellationToken ct)
    {
        if (dates.Length is 0 or > 31)
            throw new ValidationException("A draft is between one day and a month.");

        var template = await _db.Shifts
            .AsNoTracking()
            .Include(shift => shift.Location)
            .FirstOrDefaultAsync(shift => shift.Id == shiftId && shift.UserId == userId, ct)
            ?? throw new NotFoundException("No such shift.");

        // The weeks the draft touches, whole: the fifth shift's price depends
        // on the four real ones already sitting in that week.
        var from = dates.Min().AddDays(-7);
        var to = dates.Max().AddDays(7);

        var real = await _db.Days
            .AsNoTracking()
            .Include(day => day.Shifts)!
            .ThenInclude(entry => entry.Shift)
            .Where(day => day.UserId == userId && day.Date >= from && day.Date <= to)
            .ToArrayAsync(ct);

        var locations = real
            .SelectMany(day => day.Shifts ?? [])
            .Select(entry => entry.Shift?.Location)
            .Where(location => location is not null)
            .Cast<Location>()
            .Concat(template.Location is null ? [] : [template.Location])
            .DistinctBy(location => location.Id)
            .ToDictionary(location => location.Id);

        // The ghosts: the template placed on each date, marked worked so the
        // overtime walk counts them. They exist in memory and nowhere else.
        var ghosts = dates
            .Where(date => !real.Any(day => day.Date == date
                && (day.Shifts ?? []).Any(entry => entry.ShiftId == shiftId)))
            .Select(date => new Day
            {
                UserId = userId,
                Date = date,
                Shifts = [Ghost(template)],
            })
            .ToArray();

        // The real week is priced twice: once as it stands, once with the
        // ghosts in it. The draft's worth is the difference — which is the
        // only way the fifth shift can come out dearer than the fourth.
        var before = DayHandler.OvertimeByPlace(real, locations)
            .Values.Sum(pair => pair.Extra);
        var beforeHoursTotal = DayHandler.OvertimeByPlace(real, locations)
            .Values.Sum(pair => pair.Hours);

        // On days that already exist the ghost joins the day rather than
        // replacing it — a draft evening on top of a real lunch is exactly
        // the double somebody is pricing. Mutating the tracked-nowhere copies
        // is safe: AsNoTracking means these rows die with the request.
        foreach (var day in real)
        {
            if (!dates.Contains(day.Date)) continue;
            if ((day.Shifts ?? []).Any(entry => entry.ShiftId == shiftId)) continue;

            day.Shifts = [.. day.Shifts ?? [], Ghost(template)];
        }

        var withGhosts = real.Concat(ghosts).ToArray();
        var after = DayHandler.OvertimeByPlace(withGhosts, locations)
            .Values.Sum(pair => pair.Extra);
        var afterHours = DayHandler.OvertimeByPlace(withGhosts, locations)
            .Values.Sum(pair => pair.Hours);

        var ghostPlacements = withGhosts
            .Where(day => dates.Contains(day.Date))
            .SelectMany(day => (day.Shifts ?? []).Where(entry => entry.ShiftId == shiftId))
            .ToArray();

        // Per-shift pay, which is zero for a weekly or monthly template —
        // and that zero is the honest answer, not an omission: extra days on
        // a fixed wage add nothing to it. What they can add is overtime, and
        // that is counted above.
        var basePay = ghostPlacements.Sum(entry => entry.Pay);
        var hours = ghostPlacements.Sum(entry => entry.PaidDuration.TotalHours);
        var overtimeExtra = Math.Max(0m, after - before);

        return new Priced(
            Math.Round(basePay, 2),
            Math.Round(hours, 2),
            Math.Round(overtimeExtra, 2),
            Math.Round(Math.Max(0, afterHours - beforeHoursTotal), 2),
            Math.Round(basePay + overtimeExtra, 2));
    }

    private static DayShift Ghost(Shift template)
    {
        var ghost = DayShift.From(template, worked: true);

        ghost.Shift = template;

        return ghost;
    }
}
