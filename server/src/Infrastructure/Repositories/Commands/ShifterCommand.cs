using Microsoft.EntityFrameworkCore;
using Shifter.Domain.Entities;
using Shifter.Infrastructure.Persistence.DbContexts;
using Shifter.Infrastructure.Repositories.Interfaces;

namespace Shifter.Infrastructure.Repositories.Commands;

public class ShifterCommand : IShifterCommand
{
    public async Task AddGoalCheerAsync(GoalCheer cheer, CancellationToken ct)
    {
        await _db.GoalCheers.AddAsync(cheer, ct);
        await _db.SaveChangesAsync(ct);
    }

    private readonly ShifterDbContext _db;

    public ShifterCommand(ShifterDbContext db) => _db = db;

    public async Task<bool> AddDayAsync(Day day, CancellationToken ct)
    {
        await _db.AddAsync(day, ct);
        return await _db.SaveChangesAsync(ct) > 0;
    }

    public async Task<bool> AddShiftAsync(Shift shift, CancellationToken ct)
    {
        await _db.Shifts.AddAsync(shift, ct);
        return await _db.SaveChangesAsync(ct) > 0;
    }

    public async Task<bool> AddSalesAsync(Sales sales, CancellationToken ct)
    {
        await _db.Sales.AddAsync(sales, ct);
        return await _db.SaveChangesAsync(ct) > 0;
    }

    public async Task<bool> AddLocationAsync(Location location, CancellationToken ct)
    {
        await _db.Locations.AddAsync(location, ct);
        return await _db.SaveChangesAsync(ct) > 0;
    }

    public async Task<int> CountShiftsAtLocationAsync(int locationId, CancellationToken ct)
    {
        return await _db.Shifts.CountAsync(shift => shift.LocationId == locationId, ct);
    }

    public async Task DeleteLocationAsync(Location location, CancellationToken ct)
    {
        _db.Locations.Remove(location);
        await _db.SaveChangesAsync(ct);
    }

    public async Task DetachShiftsFromLocationAsync(int locationId, CancellationToken ct)
    {
        // The templates outlive the place: a shift with no location still has
        // its own hours and rate, and deleting them alongside would take the
        // days they sit on with them.
        await _db.Shifts
            .Where(shift => shift.LocationId == locationId)
            .ExecuteUpdateAsync(setters => setters.SetProperty(s => s.LocationId, _ => null), ct);
    }

    public async Task<int> CountSalesUsageAsync(int salesId, CancellationToken ct)
    {
        return await _db.DaySales.CountAsync(entry => entry.SalesId == salesId, ct);
    }

    public async Task DeleteSalesAsync(Sales sales, CancellationToken ct)
    {
        _db.Sales.Remove(sales);
        await _db.SaveChangesAsync(ct);
    }

    public async Task<bool> AddGoalAsync(Goal item, CancellationToken ct)
    {
        await _db.Goals.AddAsync(item, ct);
        return await _db.SaveChangesAsync(ct) > 0;
    }

    public async Task UpdateGoalAsync(Goal item, CancellationToken ct)
        => await _db.SaveChangesAsync(ct);

    public async Task DeleteGoalAsync(Goal item, CancellationToken ct)
    {
        _db.Goals.Remove(item);
        await _db.SaveChangesAsync(ct);
    }

    public async Task<bool> AddEventAsync(Event item, CancellationToken ct)
    {
        await _db.Events.AddAsync(item, ct);
        return await _db.SaveChangesAsync(ct) > 0;
    }

    public async Task DeleteEventAsync(Event item, CancellationToken ct)
    {
        _db.Events.Remove(item);
        await _db.SaveChangesAsync(ct);
    }

    public async Task<bool> AddExpenseRuleAsync(ExpenseRule rule, CancellationToken ct)
    {
        await _db.ExpenseRules.AddAsync(rule, ct);
        return await _db.SaveChangesAsync(ct) > 0;
    }

    public async Task DeleteExpenseRuleAsync(ExpenseRule rule, CancellationToken ct)
    {
        // The expenses somebody already confirmed stay. Stopping a travel pass
        // in June must not remove the five months of it that were paid.
        await _db.Expenses
            .Where(expense => expense.RuleId == rule.Id)
            .ExecuteUpdateAsync(row => row.SetProperty(expense => expense.RuleId, (int?)null), ct);

        _db.ExpenseRules.Remove(rule);
        await _db.SaveChangesAsync(ct);
    }

    public async Task<bool> AddEventTemplateAsync(EventTemplate item, CancellationToken ct)
    {
        await _db.EventTemplates.AddAsync(item, ct);
        return await _db.SaveChangesAsync(ct) > 0;
    }

    public async Task DeleteEventTemplateAsync(EventTemplate item, CancellationToken ct)
    {
        // The events that came from it keep their own name, colour, times and
        // cost — losing the palette entry must not blank out last spring.
        await _db.Events
            .Where(row => row.TemplateId == item.Id)
            .ExecuteUpdateAsync(row => row.SetProperty(entry => entry.TemplateId, (int?)null), ct);

        _db.EventTemplates.Remove(item);
        await _db.SaveChangesAsync(ct);
    }

    public async Task<bool> AddExpenseAsync(WorkExpense expense, CancellationToken ct)
    {
        await _db.Expenses.AddAsync(expense, ct);
        return await _db.SaveChangesAsync(ct) > 0;
    }

    public async Task DeleteExpenseAsync(WorkExpense expense, CancellationToken ct)
    {
        _db.Expenses.Remove(expense);
        await _db.SaveChangesAsync(ct);
    }

    public async Task<bool> AddPayoutAsync(Payout payout, CancellationToken ct)
    {
        await _db.Payouts.AddAsync(payout, ct);
        return await _db.SaveChangesAsync(ct) > 0;
    }

    public async Task DeletePayoutAsync(Payout payout, CancellationToken ct)
    {
        _db.Payouts.Remove(payout);
        await _db.SaveChangesAsync(ct);
    }

    public async Task<int> WipePayoutsAsync(int userId, CancellationToken ct)
    {
        // Settlements go with the payments: a period marked «paid, споримся
        // закончили» over a payment that no longer exists would be a ghost
        // verdict — the clean slate has to be actually clean.
        await _db.Set<PeriodSettlement>()
            .Where(settlement => settlement.UserId == userId)
            .ExecuteDeleteAsync(ct);

        return await _db.Payouts
            .Where(payout => payout.UserId == userId)
            .ExecuteDeleteAsync(ct);
    }

    public async Task SettlePeriodAsync(
        int userId, int locationId, DateOnly periodFrom, string stream,
        string? kind, string? note, CancellationToken ct)
    {
        PeriodSettlement? existing = await _db.PeriodSettlements.FirstOrDefaultAsync(
            entry => entry.UserId == userId
                && entry.LocationId == locationId
                && entry.PeriodFrom == periodFrom
                && entry.Stream == stream,
            ct);

        // No kind means "reopen it": the line was drawn by mistake, or the
        // conversation with the place started again.
        if (kind is null)
        {
            if (existing is not null) _db.PeriodSettlements.Remove(existing);
        }
        else if (existing is null)
        {
            _db.PeriodSettlements.Add(new PeriodSettlement
            {
                UserId = userId,
                LocationId = locationId,
                PeriodFrom = periodFrom,
                Stream = stream,
                Kind = kind,
                Note = note,
            });
        }
        else
        {
            existing.Kind = kind;
            existing.Note = note;
        }

        await _db.SaveChangesAsync(ct);
    }

    public async Task SaveAsync(CancellationToken ct)
    {
        await _db.SaveChangesAsync(ct);
    }

    public async Task<Day[]> ApplyColourAsync(
        int userId,
        Dictionary<DateOnly, string?> colours,
        CancellationToken ct)
    {
        DateOnly[] dates = colours.Keys.ToArray();

        Day[] existing = await _db.Days
            .Include(day => day.Shifts)
            .Include(day => day.Sales)
            .Where(day => day.UserId == userId && dates.Contains(day.Date))
            .ToArrayAsync(ct);

        Dictionary<DateOnly, Day> byDate = existing.ToDictionary(day => day.Date);
        List<Day> touched = [];

        foreach ((DateOnly date, string? colour) in colours)
        {
            if (!byDate.TryGetValue(date, out Day? day))
            {
                // Clearing a colour off a day that was never recorded has
                // nothing to clear, and creating an empty row to hold a null
                // would fill the calendar with days that say nothing.
                if (colour is null) continue;

                day = new Day { UserId = userId, Date = date };

                await _db.Days.AddAsync(day, ct);
                byDate[date] = day;
            }

            day.Colour = colour;
            touched.Add(day);
        }

        await _db.SaveChangesAsync(ct);

        return touched.ToArray();
    }

    public async Task<Day[]> ApplyShiftAsync(
        int userId,
        DateOnly[] dates,
        Shift shift,
        bool add,
        DateTime now,
        CancellationToken ct)
    {
        Day[] existing = await _db.Days
            .Include(day => day.Shifts)
            .Include(day => day.Sales)
            .Where(day => day.UserId == userId && dates.Contains(day.Date))
            .ToArrayAsync(ct);

        Dictionary<DateOnly, Day> byDate = existing.ToDictionary(day => day.Date);
        List<Day> touched = [];

        foreach (DateOnly date in dates.Distinct())
        {
            if (!byDate.TryGetValue(date, out Day? day))
            {
                // Removing from a day that does not exist is a no-op rather
                // than a reason to create an empty row.
                if (!add) continue;

                day = new Day { UserId = userId, Date = date, Shifts = [] };

                await _db.Days.AddAsync(day, ct);
                byDate[date] = day;
            }

            day.Shifts ??= [];

            bool changed;

            if (add)
            {
                changed = day.Shifts.All(entry => entry.ShiftId != shift.Id);

                if (changed) day.Shifts.Add(DayShift.Painted(shift, date, now));
            }
            else
            {
                List<DayShift> going = day.Shifts
                    .Where(entry => entry.ShiftId == shift.Id)
                    .ToList();

                changed = going.Count > 0;

                _db.DayShifts.RemoveRange(going);
                day.Shifts.RemoveAll(entry => entry.ShiftId == shift.Id);
            }

            // A person's stroke reaching a day. A screen still holding the old
            // version saves the day whole, and would take the paint off again
            // with no 409 to stop it. A stroke that lands on nothing moves
            // nothing, and a row made here starts at one like any other.
            if (changed) day.Version++;

            touched.Add(day);
        }

        // One save for the whole batch: a drag across a month is one round trip
        // and one transaction, not thirty of each.
        await _db.SaveChangesAsync(ct);

        return touched.ToArray();
    }

    public async Task RetimePlannedAsync(Shift before, Shift after, DateOnly today, CancellationToken ct)
    {
        DayShift[] waiting = await _db.DayShifts
            .Include(entry => entry.Day)
            .Where(entry => entry.ShiftId == after.Id
                && !entry.Worked
                && entry.Day!.Date >= today)
            .ToArrayAsync(ct);

        foreach (DayShift entry in waiting)
        {
            // Bumped so a panel open on the old hours is asked to reload
            // rather than saving a day that has moved under it.
            if (DayShiftEdit.FollowHours(entry, entry.Day!.Date, today, before, after))
                entry.Day.Version++;
        }
    }

    public async Task<Day> MergeDaySalesAsync(
        int userId,
        DaySalesMerge incoming,
        CancellationToken ct)
    {
        Day day = await LoadOrStartDayAsync(userId, incoming.Date, ct);

        // Only what arrived. A delivery of tips alone leaves the note, the
        // colour and the cash split exactly as the person left them.
        if (incoming.Tips is not null) day.Tips = incoming.Tips;
        if (incoming.TipsCash is not null) day.TipsCash = incoming.TipsCash;
        if (incoming.Deductions is not null) day.Deductions = incoming.Deductions;
        if (incoming.Note is not null) day.Note = incoming.Note;

        day.Sales ??= [];

        foreach (DaySale entry in incoming.Sales)
        {
            DaySale? existing = day.Sales.FirstOrDefault(row => row.SalesId == entry.SalesId);

            // Nothing sold is how a correction removes a line: a till that
            // resends a day without an item means the item was voided.
            if (entry.Quantity <= 0)
            {
                if (existing is null) continue;

                _db.DaySales.Remove(existing);
                day.Sales.Remove(existing);

                continue;
            }

            if (existing is null)
            {
                day.Sales.Add(entry);

                continue;
            }

            // Same as a day saved by hand: the delivery says how many, never
            // how much, and a line keeps the price it was first sold at.
            existing.Quantity = entry.Quantity;
        }

        if (incoming.Replace)
        {
            int[] sent = incoming.Sales.Select(entry => entry.SalesId).ToArray();

            List<DaySale> going = day.Sales
                .Where(row => !sent.Contains(row.SalesId))
                .ToList();

            _db.DaySales.RemoveRange(going);
            day.Sales.RemoveAll(row => !sent.Contains(row.SalesId));
        }

        BumpIfChanged(day);

        await _db.SaveChangesAsync(ct);

        return day;
    }

    public async Task<Day> MergeDayShiftAsync(
        int userId,
        DateOnly date,
        DayShift placement,
        MergeTerms terms,
        CancellationToken ct)
    {
        Day day = await LoadOrStartDayAsync(userId, date, ct);

        day.Shifts ??= [];

        DayShift? existing = day.Shifts
            .FirstOrDefault(entry => entry.ShiftId == placement.ShiftId);

        // The house rule, as on any save. Most routes hand over the template's
        // own break, so without this a delivery would give back the minutes a
        // close took, and the next tip typed would take them again.
        Location? place = await _db.Shifts
            .AsNoTracking()
            .Where(shift => shift.Id == placement.ShiftId)
            .Select(shift => shift.Location)
            .FirstOrDefaultAsync(ct);

        if (existing is null)
        {
            placement.BreakMinutes = placement.BreakUnder(place);
            day.Shifts.Add(placement);

            BumpIfChanged(day);

            await _db.SaveChangesAsync(ct);

            return day;
        }

        // Corrected in place rather than replaced, so anything hanging off the
        // placement — a cover offer, the crew's view of it — survives a second
        // delivery of the same shift.
        bool closed = existing.AutoClosedAtUtc is not null;

        // Read off the hours that earned it, before they move.
        int ownBreak = existing.OwnBreak(place);

        // Edges the close copied from the plan go with the plan they came
        // from: left behind they outrank the hours just delivered, which would
        // show on the entry and never reach the pay. Real ones stay, unless
        // this merge brought real ones of its own.
        bool endMoves = closed && existing.ActualEnd == existing.EndTime;

        TimeOnly? actualStart = closed && existing.ActualStart == existing.StartTime
            ? placement.StartTime
            : existing.ActualStart;
        TimeOnly? actualEnd = endMoves ? placement.EndTime : existing.ActualEnd;

        // A count says how long and was worked out from the template's start,
        // so where a real start stays it runs from there, or the pay would be
        // out by however far the two sit apart.
        if (terms.Counted && endMoves && actualStart is TimeOnly began)
            actualEnd = began.Add(placement.Duration);

        // Real edges at both ends are what the pay reads, and a count moves
        // neither: its end never became the shift's, so its break has no claim.
        bool edgesHold = !endMoves && actualStart is not null && actualEnd is not null;

        existing.SalaryPeriod = placement.SalaryPeriod;
        existing.SalaryAmount = placement.SalaryAmount;
        existing.StartTime = placement.StartTime;
        existing.EndTime = placement.EndTime;
        existing.ActualStart = placement.ActualStart ?? actualStart;
        existing.ActualEnd = placement.ActualEnd ?? actualEnd;

        // A template's break says what is usual and no more, so it cannot
        // shorten a break somebody actually took: that would raise the pay of
        // a shift for being finished from the bot. One the route delivered is
        // a statement about this shift and stands, either way, and so does one
        // a count was worked out on wherever that count sets the end.
        existing.BreakMinutes = terms.BreakStated || (terms.Counted && !edgesHold)
            ? placement.BreakMinutes
            : Math.Max(ownBreak, placement.BreakMinutes);
        existing.BreakMinutes = existing.BreakUnder(place);

        // A close stands until a person answers it, the rule DayShiftEdit keeps
        // for saves. Lowered here the pay would go with no word to anyone, and
        // the stamp would keep the job from ever giving it back. A route that
        // only plans time has no answer to give either: a shift finished by
        // hand stays worked when the rota entry for it is accepted afterwards.
        existing.Worked = placement.Worked || ((closed || terms.PlanOnly) && existing.Worked);

        BumpIfChanged(day);

        await _db.SaveChangesAsync(ct);

        return day;
    }

    /// <summary>Moves the version when a merge left the day other than it was read.</summary>
    // What arrives through a merge is somebody's word about the day, and a
    // panel holding the old version would bury it with its next save, which
    // carries the day whole. A new row counts: no row reads as version zero,
    // so a day opened at zero would stop nobody. A sender repeating itself
    // changes nothing and moves nothing, or a retry would hand a 409 to a
    // panel nobody touched. Only the close job stays out of this.
    private void BumpIfChanged(Day day)
    {
        bool changed = _db.ChangeTracker.Entries()
            .Any(row => row.State != EntityState.Unchanged && row.Entity switch
            {
                Day same => same == day,
                DayShift placed => placed.DayId == day.Id,
                DaySale sold => sold.DayId == day.Id,
                _ => false,
            });

        if (changed) day.Version++;
    }

    /// <summary>The day with its contents attached, tracked, created if this is the first thing to land on it.</summary>
    private async Task<Day> LoadOrStartDayAsync(int userId, DateOnly date, CancellationToken ct)
    {
        Day? existing = await _db.Days
            .Include(day => day.Shifts)
            .Include(day => day.Sales)
            .FirstOrDefaultAsync(day => day.UserId == userId && day.Date == date, ct);

        if (existing is not null) return existing;

        Day day = new Day { UserId = userId, Date = date, Shifts = [], Sales = [] };

        await _db.Days.AddAsync(day, ct);

        return day;
    }

    public async Task<Day> UpsertDayAsync(Day incoming, CancellationToken ct)
    {
        Day? existing = await _db.Days
            .Include(d => d.Shifts)
            .Include(d => d.Sales)
            .FirstOrDefaultAsync(
                d => d.UserId == incoming.UserId && d.Date == incoming.Date,
                ct);

        if (existing is null)
        {
            incoming.Version = 1;

            await _db.Days.AddAsync(incoming, ct);
            await _db.SaveChangesAsync(ct);

            return incoming;
        }

        existing.Version++;

        // Every scalar the save carries, not a subset. Cash tips, deductions,
        // the tip pool and the fine's reason were each missing here at some
        // point and simply never persisted on a day that already existed: the
        // value came back correct in the response, built from the request, and
        // was gone by the next reload. The copy is derived from the entity now
        // so the next field cannot be forgotten.
        DayScalars.CopyOnto(existing, incoming);

        // A placement that is already on this day keeps the terms it was made
        // under and takes only the save's edits. Replacing it outright — which
        // is what this did — meant the snapshot on DayShift protected nothing:
        // reprice a template in April, open a March day to add a note, and
        // March silently earned more, while the raise vanished from a history
        // that is read out of these very snapshots.
        var (kept, dropped) = DayShiftEdit.Merge(existing.Shifts, incoming.Shifts);

        // Whatever nobody claimed was taken off the day.
        if (dropped.Count > 0) _db.DayShifts.RemoveRange(dropped);

        existing.Shifts = kept;

        // Sales already on the day are corrected where they stand, like the
        // placements above. A save carries the whole day and the autosave
        // sends one for every pause in typing a tip, so deleting and inserting
        // each line again wrote rows for figures that had not moved. Only the
        // count moves: a line keeps the price it was sold at, or fixing a note
        // on an old day would reprice it to today's catalogue.
        List<DaySale> sold = [];

        foreach (DaySale entry in incoming.Sales ?? [])
        {
            DaySale? row = existing.Sales?.FirstOrDefault(sale => sale.SalesId == entry.SalesId);

            if (row is null)
            {
                sold.Add(entry);

                continue;
            }

            row.Quantity = entry.Quantity;

            sold.Add(row);
        }

        List<DaySale> voided = existing.Sales?.Except(sold).ToList() ?? [];

        if (voided.Count > 0) _db.DaySales.RemoveRange(voided);

        existing.Sales = sold;

        await _db.SaveChangesAsync(ct);

        return existing;
    }
}
