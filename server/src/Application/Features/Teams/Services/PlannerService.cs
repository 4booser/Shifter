using Microsoft.EntityFrameworkCore;
using Shifter.Application.Common.Exceptions;
using Shifter.Application.Features.Push;
using Shifter.Application.Features.Teams.DTOs;
using Shifter.Application.Features.business.Services;
using Shifter.Infrastructure.Repositories.Interfaces;
using Shifter.Domain.Entities;
using Shifter.Domain.Entities.Enums;
using Shifter.Infrastructure.Persistence.DbContexts;

namespace Shifter.Application.Features.Teams.Services;

/// <summary>
/// The manager's board. A manager plans time — never money: an assignment
/// carries a title and hours, and becomes a shift only when its person
/// accepts it onto their own calendar with their own template. Everything
/// here is scoped twice: to the team, and to the caller's right to touch it.
/// </summary>
public sealed class PlannerService
{
    private readonly ShifterDbContext _db;
    private readonly IShifterCommand _days;
    private readonly IPushNotifier _push;
    private readonly DayAuditWriter _audit;

    public PlannerService(ShifterDbContext db, IShifterCommand days, IPushNotifier push, DayAuditWriter audit)
    {
        _db = db;
        _days = days;
        _push = push;
        _audit = audit;
    }

    // ==== Access ====

    private async Task<(Team Team, TeamMember Me)> MemberAsync(int teamId, int userId, CancellationToken ct)
    {
        var team = await _db.Teams
            .Include(entry => entry.Members)
            .FirstOrDefaultAsync(entry => entry.Id == teamId, ct)
            ?? throw new NotFoundException("Team does not exist.");

        var me = (team.Members ?? []).FirstOrDefault(member => member.UserId == userId)
            ?? throw new ForbiddenException("You are not in this team.");

        return (team, me);
    }

    private static bool Plans(Team team, TeamMember member)
        => team.OwnerUserId == member.UserId || member.IsManager;

    private async Task<(Team Team, TeamMember Me)> ManagerAsync(int teamId, int userId, CancellationToken ct)
    {
        var context = await MemberAsync(teamId, userId, ct);

        if (!Plans(context.Team, context.Me))
            throw new ForbiddenException("Only the owner or a manager may plan.");

        return context;
    }

    // ==== The board ====

    public async Task<PlannerBoardDto> BoardAsync(
        int teamId, int userId, DateOnly from, DateOnly to, CancellationToken ct)
    {
        var (team, me) = await MemberAsync(teamId, userId, ct);
        var plans = Plans(team, me);

        var rows = await _db.PlannedAssignments
            .AsNoTracking()
            .Where(entry => entry.TeamId == teamId && entry.Date >= from && entry.Date <= to)
            // Drafts are the manager's thinking; nobody else sees them.
            .Where(entry => plans || (entry.UserId == userId && entry.Status != AssignmentStatus.Draft))
            .OrderBy(entry => entry.Date)
            .ThenBy(entry => entry.StartTime)
            .ToArrayAsync(ct);

        var members = (team.Members ?? [])
            .OrderByDescending(member => member.UserId == team.OwnerUserId)
            .ThenBy(member => member.DisplayName)
            .Select(member => new PlannerMemberDto(
                member.UserId,
                member.DisplayName,
                member.Colour,
                member.UserId == team.OwnerUserId,
                member.IsManager))
            .ToArray();

        var names = members.ToDictionary(member => member.user_id, member => member.display_name);

        return new PlannerBoardDto(
            members,
            rows.Select(entry => ToDto(entry, names)).ToArray(),
            plans,
            team.OwnerUserId == userId,
            // The blocked days ride along with the board: a manager should
            // learn about a conflict while drafting, not after publishing.
            await BlocksAsync(teamId, userId, from, to, ct),
            // Only somebody who plans sees coverage: it is a statement about
            // everyone's week, and a member's board holds only their own rows,
            // so counting from it would be a confident wrong answer.
            plans ? Coverage(rows) : []);
    }

    // ==== Availability: the days people have said they cannot work ====

    public async Task<AvailabilityDto[]> AvailabilityAsync(
        int teamId, int userId, DateOnly from, DateOnly to, CancellationToken ct)
    {
        await MemberAsync(teamId, userId, ct);

        return await BlocksAsync(teamId, userId, from, to, ct);
    }

    /// <summary>Blocking a day, or lifting the block by sending it again.</summary>
    public async Task<AvailabilityDto[]> ToggleAvailabilityAsync(
        int teamId, int userId, AvailabilitySaveDto request, CancellationToken ct)
    {
        await MemberAsync(teamId, userId, ct);

        if (!DateOnly.TryParseExact(request.date, "yyyy-MM-dd", out var date))
            throw new ValidationException("date must be yyyy-MM-dd.");

        var existing = await _db.Availabilities
            .FirstOrDefaultAsync(block => block.TeamId == teamId && block.UserId == userId && block.Date == date, ct);

        if (existing is not null) _db.Availabilities.Remove(existing);
        else
            _db.Availabilities.Add(new Availability
            {
                TeamId = teamId,
                UserId = userId,
                Date = date,
                // A blocked day usually has no reason attached, and CleanTitle
                // exists to reject an empty title — passing it a null threw
                // rather than validated, so blocking a day without saying why
                // returned a 500.
                Reason = PlannerRules.CleanReason(request.reason),
            });

        await _db.SaveChangesAsync(ct);

        return await BlocksAsync(teamId, userId, date.AddDays(-31), date.AddDays(31), ct);
    }

    private async Task<AvailabilityDto[]> BlocksAsync(
        int teamId, int userId, DateOnly from, DateOnly to, CancellationToken ct)
    {
        var blocks = await _db.Availabilities
            .AsNoTracking()
            .Where(block => block.TeamId == teamId && block.Date >= from && block.Date <= to)
            .ToArrayAsync(ct);

        return blocks
            .Select(block => new AvailabilityDto(
                block.UserId,
                block.Date.ToString("yyyy-MM-dd"),
                block.Reason,
                block.UserId == userId))
            .ToArray();
    }

    // ==== The handover: what the shift going home knows ====

    /// <summary>
    /// One day's note plus everything the room is currently missing. Read at
    /// the start of a shift, written at the end of one.
    /// </summary>
    public async Task<(HandoverDto Note, StopItemDto[] Stops)> HandoverAsync(
        int teamId, int userId, DateOnly date, CancellationToken ct)
    {
        var (team, _) = await MemberAsync(teamId, userId, ct);

        var note = await _db.Handovers
            .AsNoTracking()
            .FirstOrDefaultAsync(row => row.TeamId == teamId && row.Date == date, ct);

        var stops = await _db.StopItems
            .AsNoTracking()
            .Where(item => item.TeamId == teamId && item.ClearedAt == null)
            .OrderBy(item => item.RaisedAt)
            .ToArrayAsync(ct);

        return (ToDto(note, date, team), stops.Select(item => ToDto(item, team)).ToArray());
    }

    /// <summary>
    /// Writing the note. Anybody in the crew may — the person who knows the
    /// grinder is broken is whoever was standing next to it, not whoever has
    /// the manager flag.
    /// </summary>
    public async Task<HandoverDto> WriteHandoverAsync(
        int teamId, int userId, HandoverSaveDto request, CancellationToken ct)
    {
        var (team, _) = await MemberAsync(teamId, userId, ct);

        if (!DateOnly.TryParseExact(request.date, "yyyy-MM-dd", out var date))
            throw new ValidationException("date must be yyyy-MM-dd.");

        string text = (request.text ?? string.Empty).Trim();

        if (text.Length > Handover.TextMax)
            text = text[..Handover.TextMax];

        var note = await _db.Handovers
            .FirstOrDefaultAsync(row => row.TeamId == teamId && row.Date == date, ct);

        if (note is null)
        {
            note = new Handover { TeamId = teamId, Date = date };
            _db.Handovers.Add(note);
        }

        note.Text = text;
        note.UpdatedByUserId = userId;
        note.UpdatedAt = DateTime.UtcNow;

        await _db.SaveChangesAsync(ct);

        return ToDto(note, date, team);
    }

    /// <summary>Something ran out, or something broke.</summary>
    public async Task<StopItemDto[]> RaiseStopAsync(
        int teamId, int userId, StopItemSaveDto request, CancellationToken ct)
    {
        var (team, _) = await MemberAsync(teamId, userId, ct);

        string name = (request.name ?? string.Empty).Trim();

        if (name.Length is 0 or > StopItem.NameMax)
            throw new ValidationException($"A name of 1–{StopItem.NameMax} characters, please.");

        string kind = request.kind == "broken" ? "broken" : "stop";

        // The same thing twice is one thing. Raising it again while it is still
        // open would put two identical lines in front of the next shift.
        bool already = await _db.StopItems.AnyAsync(
            item => item.TeamId == teamId
                && item.ClearedAt == null
                && item.Kind == kind
                && item.Name.ToLower() == name.ToLower(),
            ct);

        if (!already)
        {
            _db.StopItems.Add(new StopItem
            {
                TeamId = teamId,
                Kind = kind,
                Name = name,
                RaisedByUserId = userId,
            });

            await _db.SaveChangesAsync(ct);
        }

        return await OpenStopsAsync(teamId, team, ct);
    }

    /// <summary>It came back, or it was fixed.</summary>
    public async Task<StopItemDto[]> ClearStopAsync(
        int teamId, int userId, int id, CancellationToken ct)
    {
        var (team, _) = await MemberAsync(teamId, userId, ct);

        var item = await _db.StopItems
            .FirstOrDefaultAsync(row => row.Id == id && row.TeamId == teamId, ct)
            ?? throw new NotFoundException("That is not on the list.");

        // The row stays rather than going: how often something runs out is
        // worth knowing, and a list that deletes its own history cannot say.
        item.ClearedAt = DateTime.UtcNow;
        item.ClearedByUserId = userId;

        await _db.SaveChangesAsync(ct);

        return await OpenStopsAsync(teamId, team, ct);
    }

    private async Task<StopItemDto[]> OpenStopsAsync(int teamId, Team team, CancellationToken ct)
    {
        var stops = await _db.StopItems
            .AsNoTracking()
            .Where(item => item.TeamId == teamId && item.ClearedAt == null)
            .OrderBy(item => item.RaisedAt)
            .ToArrayAsync(ct);

        return stops.Select(item => ToDto(item, team)).ToArray();
    }

    private static HandoverDto ToDto(Handover? note, DateOnly date, Team team)
    {
        if (note is null) return new HandoverDto(date.ToString("yyyy-MM-dd"), string.Empty, null, null);

        string? by = (team.Members ?? [])
            .FirstOrDefault(member => member.UserId == note.UpdatedByUserId)?.DisplayName;

        return new HandoverDto(
            note.Date.ToString("yyyy-MM-dd"),
            note.Text,
            by,
            note.UpdatedAt.ToString("O"));
    }

    private static StopItemDto ToDto(StopItem item, Team team) => new StopItemDto(
        item.Id,
        item.Kind,
        item.Name,
        (team.Members ?? []).FirstOrDefault(member => member.UserId == item.RaisedByUserId)
            ?.DisplayName ?? string.Empty,
        DateOnly.FromDateTime(item.RaisedAt).ToString("yyyy-MM-dd"),
        (DateTime.UtcNow - item.RaisedAt).Days,
        item.ClearedAt is not null);

    // ==== Leave: a stretch of days that needs an answer ====

    /// <summary>
    /// Every request the caller is entitled to see: a planner sees the crew's,
    /// everybody else sees their own. Waiting first, because that is the list
    /// somebody has to act on; the rest is history.
    /// </summary>
    public async Task<LeaveDto[]> LeaveAsync(int teamId, int userId, CancellationToken ct)
    {
        var (team, me) = await MemberAsync(teamId, userId, ct);
        bool plans = Plans(team, me);

        var requests = await _db.LeaveRequests
            .AsNoTracking()
            .Where(entry => entry.TeamId == teamId && (plans || entry.UserId == userId))
            .ToArrayAsync(ct);

        return Ordered(requests, team, userId, plans);
    }

    /// <summary>Asking for time off.</summary>
    public async Task<LeaveDto[]> RequestLeaveAsync(
        int teamId, int userId, LeaveSaveDto request, CancellationToken ct)
    {
        var (team, me) = await MemberAsync(teamId, userId, ct);

        if (!DateOnly.TryParseExact(request.from, "yyyy-MM-dd", out var from)
            || !DateOnly.TryParseExact(request.to, "yyyy-MM-dd", out var to))
            throw new ValidationException("from and to must be yyyy-MM-dd.");

        if (from > to)
            throw new ValidationException("Leave cannot end before it starts.");

        if (to.DayNumber - from.DayNumber + 1 > LeaveRequest.MaxDays)
            throw new ValidationException(
                $"Leave cannot be longer than {LeaveRequest.MaxDays} days.");

        var mine = await _db.LeaveRequests
            .Where(entry => entry.TeamId == teamId
                && entry.UserId == userId
                && entry.Status != LeaveStatus.Declined)
            .ToArrayAsync(ct);

        // Two rows asking for the same fortnight is not two requests — it is
        // one request nobody can answer cleanly, and a manager approving the
        // wrong one would leave the other waiting forever.
        if (mine.Any(entry => LeaveRules.Overlaps(entry, from, to)))
            throw new ValidationException("You have already asked for some of those days.");

        _db.LeaveRequests.Add(new LeaveRequest
        {
            TeamId = teamId,
            UserId = userId,
            From = from,
            To = to,
            Reason = LeaveRules.CleanReason(request.reason),
        });

        await _db.SaveChangesAsync(ct);

        return await LeaveAsync(teamId, userId, ct);
    }

    /// <summary>Answering one. Only a planner may, and never their own.</summary>
    public async Task<LeaveDto[]> DecideLeaveAsync(
        int teamId, int userId, int id, LeaveDecisionDto decision, CancellationToken ct)
    {
        var (team, _) = await ManagerAsync(teamId, userId, ct);

        var request = await _db.LeaveRequests
            .FirstOrDefaultAsync(entry => entry.Id == id && entry.TeamId == teamId, ct)
            ?? throw new NotFoundException("That request does not exist.");

        // Approving your own holiday is not a decision, it is a note to self —
        // and it would let one manager quietly empty a Saturday.
        if (request.UserId == userId)
            throw new ForbiddenException("Somebody else has to answer your own request.");

        request.Status = decision.approve ? LeaveStatus.Approved : LeaveStatus.Declined;
        request.DecidedByUserId = userId;
        request.DecidedAt = DateTime.UtcNow;
        request.DecisionNote = LeaveRules.CleanReason(decision.note);

        await _db.SaveChangesAsync(ct);

        return await LeaveAsync(teamId, userId, ct);
    }

    /// <summary>
    /// Withdrawing a request. Whoever asked may take it back at any point,
    /// approved or not: plans change, and a holiday nobody is taking should
    /// not keep somebody off the rota. A planner may also clear one out.
    /// </summary>
    public async Task<LeaveDto[]> WithdrawLeaveAsync(
        int teamId, int userId, int id, CancellationToken ct)
    {
        var (team, me) = await MemberAsync(teamId, userId, ct);

        var request = await _db.LeaveRequests
            .FirstOrDefaultAsync(entry => entry.Id == id && entry.TeamId == teamId, ct)
            ?? throw new NotFoundException("That request does not exist.");

        if (request.UserId != userId && !Plans(team, me))
            throw new ForbiddenException("That request is not yours.");

        _db.LeaveRequests.Remove(request);
        await _db.SaveChangesAsync(ct);

        return await LeaveAsync(teamId, userId, ct);
    }

    private static LeaveDto[] Ordered(
        LeaveRequest[] requests, Team team, int userId, bool plans)
    {
        var names = (team.Members ?? []).ToDictionary(
            member => member.UserId,
            member => member.DisplayName);

        return requests
            // Waiting first: that is the list somebody has to act on. Then by
            // when the leave starts, because the soonest one is the most
            // expensive to leave unanswered.
            .OrderBy(entry => entry.Status == LeaveStatus.Pending ? 0 : 1)
            .ThenBy(entry => entry.From)
            .Select(entry => new LeaveDto(
                entry.Id,
                entry.UserId,
                names.GetValueOrDefault(entry.UserId, string.Empty),
                entry.From.ToString("yyyy-MM-dd"),
                entry.To.ToString("yyyy-MM-dd"),
                entry.Days,
                entry.Reason,
                entry.Status.ToString().ToLowerInvariant(),
                entry.DecidedByUserId is int by ? names.GetValueOrDefault(by, string.Empty) : null,
                entry.DecidedAt?.ToString("yyyy-MM-dd"),
                entry.DecisionNote,
                entry.UserId == userId,
                // Nobody answers their own, however senior they are.
                plans && entry.UserId != userId && entry.Status == LeaveStatus.Pending))
            .ToArray();
    }

    private static string RoleName(PlanRole role) =>
        role == PlanRole.Unset ? string.Empty : role.ToString().ToLowerInvariant();

    /// <summary>
    /// What each day is covered by. Drafts count: the point of the readout is
    /// to catch a hole while the week can still be changed.
    /// </summary>
    private static CoverageDayDto[] Coverage(PlannedAssignment[] rows) => rows
        .Where(entry => entry.Status != AssignmentStatus.Declined)
        .GroupBy(entry => entry.Date)
        .OrderBy(group => group.Key)
        .Select(group => new CoverageDayDto(
            group.Key.ToString("yyyy-MM-dd"),
            group
                .Where(entry => entry.Role != PlanRole.Unset)
                .GroupBy(entry => entry.Role)
                .OrderBy(role => role.Key)
                .Select(role => new CoverageRoleDto(RoleName(role.Key), role.Count()))
                .ToArray(),
            group.Count(entry => entry.Role == PlanRole.Unset)))
        .ToArray();

    private static AssignmentDto ToDto(PlannedAssignment entry, IReadOnlyDictionary<int, string> names)
        => new(
            entry.Id,
            entry.UserId,
            names.GetValueOrDefault(entry.UserId, "?"),
            entry.Date.ToString("yyyy-MM-dd"),
            entry.Title,
            entry.StartTime.ToString("HH:mm"),
            entry.EndTime.ToString("HH:mm"),
            entry.Note,
            entry.Status.ToString().ToLowerInvariant(),
            RoleName(entry.Role));

    // ==== Handing a slot out ====

    /// <summary>
    /// Fills one slot with the people who can take it, fewest planned hours
    /// first. Deliberately greedy and deliberately dumb: a rota is argued
    /// about, so this produces drafts a manager corrects, not a schedule it
    /// insists on. What it will not do is put somebody on a day they blocked
    /// or double-book them, because those are the two mistakes a person
    /// laying out a week by hand actually makes.
    /// </summary>
    public async Task<FillResultDto> FillAsync(
        int teamId, int userId, FillSlotDto request, CancellationToken ct)
    {
        var (team, _) = await ManagerAsync(teamId, userId, ct);

        var (date, start, end) = PlannerRules.ParseSlot(request.date, request.start, request.end);
        var title = PlannerRules.CleanTitle(request.title);
        var role = PlannerRules.ParseRole(request.role);

        if (request.count is < 1 or > 20)
            throw new ValidationException("От одного до двадцати человек за раз.");

        // The week the day sits in: hours are balanced across it, because
        // "fair" over a fortnight is not what anybody argues about.
        var monday = date.AddDays(-(((int)date.DayOfWeek + 6) % 7));
        var sunday = monday.AddDays(6);

        var week = await _db.PlannedAssignments
            .AsNoTracking()
            .Where(entry => entry.TeamId == teamId
                && entry.Date >= monday
                && entry.Date <= sunday
                && entry.Status != AssignmentStatus.Declined)
            .ToArrayAsync(ct);

        var blocked = await _db.Availabilities
            .AsNoTracking()
            .Where(entry => entry.TeamId == teamId && entry.Date == date)
            .Select(entry => entry.UserId)
            .ToArrayAsync(ct);

        // Approved leave keeps somebody off the day as firmly as a blocked one.
        // A request still waiting does not: planning around a question is how
        // people end up with neither the shift nor the holiday.
        var onLeave = await _db.LeaveRequests
            .AsNoTracking()
            .Where(entry => entry.TeamId == teamId
                && entry.Status == LeaveStatus.Approved
                && entry.From <= date
                && entry.To >= date)
            .Select(entry => entry.UserId)
            .ToArrayAsync(ct);

        var busy = week
            .Where(entry => entry.Date == date)
            .Select(entry => entry.UserId)
            .ToHashSet();

        var hours = week
            .GroupBy(entry => entry.UserId)
            .ToDictionary(group => group.Key, group => group.Sum(entry => Span(entry)));

        var candidates = (team.Members ?? [])
            .Where(member => !blocked.Contains(member.UserId)
                && !onLeave.Contains(member.UserId)
                && !busy.Contains(member.UserId))
            // Fewest planned hours first, then by name so the same week laid
            // out twice comes out the same way.
            .OrderBy(member => hours.GetValueOrDefault(member.UserId, 0d))
            .ThenBy(member => member.DisplayName, StringComparer.Ordinal)
            .Take(request.count)
            .ToArray();

        var names = (team.Members ?? []).ToDictionary(
            member => member.UserId, member => member.DisplayName);

        List<PlannedAssignment> placed = [];

        foreach (var member in candidates)
        {
            var entry = new PlannedAssignment
            {
                TeamId = teamId,
                UserId = member.UserId,
                CreatedByUserId = userId,
                Date = date,
                Title = title,
                StartTime = start,
                EndTime = end,
                Role = role,
            };

            _db.PlannedAssignments.Add(entry);
            placed.Add(entry);
        }

        if (placed.Count > 0) await _db.SaveChangesAsync(ct);

        var missing = request.count - placed.Count;

        return new FillResultDto(
            placed.Select(entry => ToDto(entry, names)).ToArray(),
            request.count,
            missing <= 0
                ? null
                : blocked.Length + onLeave.Length + busy.Count > 0
                    // Naming the reasons is the point of the line: "не хватило"
                    // on its own reads as a bug in the app rather than a fact
                    // about the crew.
                    ? $"Не хватило {missing} — остальные заняты в этот день, в отпуске или отметили «не могу»."
                    : $"Не хватило {missing} — в команде меньше людей.");
    }

    /// <summary>Hours of one cell, wrapping past midnight.</summary>
    private static double Span(PlannedAssignment entry)
    {
        var span = entry.EndTime - entry.StartTime;

        return (span < TimeSpan.Zero ? span + TimeSpan.FromDays(1) : span).TotalHours;
    }

    // ==== Drafting ====

    public async Task<AssignmentDto> SaveAsync(
        int teamId, int userId, int? id, AssignmentSaveDto request, CancellationToken ct)
    {
        var (team, _) = await ManagerAsync(teamId, userId, ct);

        var (date, start, end) = PlannerRules.ParseSlot(request.date, request.start, request.end);
        var title = PlannerRules.CleanTitle(request.title);

        if ((team.Members ?? []).All(member => member.UserId != request.user_id))
            throw new ValidationException("That person is not in the team.");

        PlannedAssignment entry;

        if (id is int existingId)
        {
            entry = await _db.PlannedAssignments
                .FirstOrDefaultAsync(row => row.Id == existingId && row.TeamId == teamId, ct)
                ?? throw new NotFoundException("Assignment does not exist.");

            // A published question cannot be quietly rewritten under the
            // person; retract it (delete) and draft again.
            if (entry.Status != AssignmentStatus.Draft)
                throw new ConflictException("Only drafts can be edited.");

            entry.UserId = request.user_id;
            entry.Date = date;
            entry.Title = title;
            entry.StartTime = start;
            entry.EndTime = end;
            entry.Note = PlannerRules.CleanNote(request.note);
            entry.Role = PlannerRules.ParseRole(request.role);
        }
        else
        {
            entry = new PlannedAssignment
            {
                TeamId = teamId,
                UserId = request.user_id,
                CreatedByUserId = userId,
                Date = date,
                Title = title,
                StartTime = start,
                EndTime = end,
                Note = request.note,
                Role = PlannerRules.ParseRole(request.role),
            };
            _db.PlannedAssignments.Add(entry);
        }

        await _db.SaveChangesAsync(ct);

        var names = (team.Members ?? []).ToDictionary(member => member.UserId, member => member.DisplayName);

        return ToDto(entry, names);
    }

    public async Task DeleteAsync(int teamId, int userId, int id, CancellationToken ct)
    {
        await ManagerAsync(teamId, userId, ct);

        var entry = await _db.PlannedAssignments
            .FirstOrDefaultAsync(row => row.Id == id && row.TeamId == teamId, ct)
            ?? throw new NotFoundException("Assignment does not exist.");

        var wasPublished = entry.Status is AssignmentStatus.Published;
        var holder = entry.UserId;
        var when = $"{entry.Date:dd.MM} · {entry.StartTime:HH\\:mm}–{entry.EndTime:HH\\:mm}";
        var title = entry.Title;

        _db.PlannedAssignments.Remove(entry);
        await _db.SaveChangesAsync(ct);

        // Taking back a question that was already asked deserves a word.
        if (wasPublished)
        {
            await _push.NotifyAsync(
                holder,
                language => language switch
                {
                    "ru" => ("Смену сняли", $"«{title}» {when} больше не ваша — план изменился."),
                    "uk" => ("Зміну зняли", $"«{title}» {when} більше не ваша — план змінився."),
                    _ => ("Assignment withdrawn", $"“{title}” {when} is off — the plan changed."),
                },
                "/schedule",
                ct);
        }
    }

    // ==== Publishing ====

    public async Task<PublishResultDto> PublishAsync(
        int teamId, int userId, DateOnly from, DateOnly to, CancellationToken ct)
    {
        await ManagerAsync(teamId, userId, ct);

        var drafts = await _db.PlannedAssignments
            .Where(entry => entry.TeamId == teamId
                && entry.Status == AssignmentStatus.Draft
                && entry.Date >= from
                && entry.Date <= to)
            .ToListAsync(ct);

        if (drafts.Count == 0) return new PublishResultDto(0, 0);

        var now = DateTime.UtcNow;

        foreach (var entry in drafts)
        {
            entry.Status = AssignmentStatus.Published;
            entry.PublishedAt = now;
        }

        await _db.SaveChangesAsync(ct);

        // One push per person, not one per cell: "your week is up" beats
        // seven buzzes in a row.
        foreach (var group in drafts.GroupBy(entry => entry.UserId))
        {
            var count = group.Count();
            var span = $"{from:dd.MM}–{to:dd.MM}";

            await _push.NotifyAsync(
                group.Key,
                language => language switch
                {
                    "ru" => ("Вам предложили смены", $"{count} на {span}. Откройте график, чтобы принять."),
                    "uk" => ("Вам запропонували зміни", $"{count} на {span}. Відкрийте графік, щоб прийняти."),
                    _ => ("Shifts proposed to you", $"{count} for {span}. Open the rota to accept."),
                },
                "/schedule",
                ct);
        }

        return new PublishResultDto(drafts.Count, drafts.Select(entry => entry.UserId).Distinct().Count());
    }

    /// <summary>
    /// Copies last week's board into the week starting at
    /// <paramref name="weekStart"/>, as fresh drafts. A cell where the target
    /// week already has anything — draft, published, answered — is left
    /// alone, so the copy is safe to press twice and never overwrites a
    /// conversation already in progress. People who have left the team since
    /// last week are skipped: a draft for a ghost helps nobody.
    /// </summary>
    public async Task<CopyWeekResultDto> CopyWeekAsync(
        int teamId, int userId, DateOnly weekStart, CancellationToken ct)
    {
        var (team, _) = await ManagerAsync(teamId, userId, ct);

        var sourceStart = weekStart.AddDays(-7);
        var sourceEnd = weekStart.AddDays(-1);
        var targetEnd = weekStart.AddDays(6);

        var source = await _db.PlannedAssignments
            .Where(entry => entry.TeamId == teamId
                && entry.Date >= sourceStart
                && entry.Date <= sourceEnd)
            .ToListAsync(ct);

        var taken = (await _db.PlannedAssignments
            .Where(entry => entry.TeamId == teamId
                && entry.Date >= weekStart
                && entry.Date <= targetEnd)
            .Select(entry => new { entry.UserId, entry.Date })
            .ToListAsync(ct))
            .Select(cell => (cell.UserId, cell.Date))
            .ToHashSet();

        var members = (team.Members ?? []).Select(member => member.UserId).ToHashSet();
        var copied = 0;

        foreach (var entry in source)
        {
            var date = entry.Date.AddDays(7);

            if (!members.Contains(entry.UserId) || taken.Contains((entry.UserId, date))) continue;

            _db.PlannedAssignments.Add(new PlannedAssignment
            {
                TeamId = teamId,
                UserId = entry.UserId,
                CreatedByUserId = userId,
                Date = date,
                Title = entry.Title,
                StartTime = entry.StartTime,
                EndTime = entry.EndTime,
                Note = entry.Note,
                Role = entry.Role,
            });
            copied++;
        }

        if (copied > 0) await _db.SaveChangesAsync(ct);

        return new CopyWeekResultDto(copied);
    }

    // ==== The person's side ====

    public async Task<AssignmentDto[]> MineAsync(int teamId, int userId, CancellationToken ct)
    {
        var (team, _) = await MemberAsync(teamId, userId, ct);
        var today = DateOnly.FromDateTime(DateTime.UtcNow.Date);

        var rows = await _db.PlannedAssignments
            .AsNoTracking()
            .Where(entry => entry.TeamId == teamId
                && entry.UserId == userId
                && entry.Status == AssignmentStatus.Published
                && entry.Date >= today)
            .OrderBy(entry => entry.Date)
            .ToArrayAsync(ct);

        var names = (team.Members ?? []).ToDictionary(member => member.UserId, member => member.DisplayName);

        return rows.Select(entry => ToDto(entry, names)).ToArray();
    }

    public async Task<AssignmentDto> AcceptAsync(
        int teamId, int userId, int id, int templateId, CancellationToken ct)
    {
        var (team, _) = await MemberAsync(teamId, userId, ct);

        var entry = await OwnPublishedAsync(teamId, userId, id, ct);

        var template = await _db.Shifts
            .AsNoTracking()
            .FirstOrDefaultAsync(shift => shift.Id == templateId && shift.UserId == userId && !shift.Archived, ct)
            ?? throw new NotFoundException("That shift template is not yours.");

        // The assignment plans time; the person's own template prices it.
        var placement = DayShift.From(template, worked: false);

        placement.StartTime = entry.StartTime;
        placement.EndTime = entry.EndTime;
        // Bare FK only: the untracked template riding the navigation would be
        // INSERTed as a brand-new Shift with an existing key.
        placement.Shift = null;

        var mergedDay = await _days.MergeDayShiftAsync(userId, entry.Date, placement, ct);

        await _audit.WriteAsync(userId, mergedDay, "assignment", ct);

        entry.Status = AssignmentStatus.Accepted;
        entry.RespondedAt = DateTime.UtcNow;
        await _db.SaveChangesAsync(ct);

        await AnswerAsync(entry, team, accepted: true, ct);

        var names = (team.Members ?? []).ToDictionary(member => member.UserId, member => member.DisplayName);

        return ToDto(entry, names);
    }

    public async Task<AssignmentDto> DeclineAsync(int teamId, int userId, int id, CancellationToken ct)
    {
        var (team, _) = await MemberAsync(teamId, userId, ct);
        var entry = await OwnPublishedAsync(teamId, userId, id, ct);

        entry.Status = AssignmentStatus.Declined;
        entry.RespondedAt = DateTime.UtcNow;
        await _db.SaveChangesAsync(ct);

        await AnswerAsync(entry, team, accepted: false, ct);

        var names = (team.Members ?? []).ToDictionary(member => member.UserId, member => member.DisplayName);

        return ToDto(entry, names);
    }

    private async Task<PlannedAssignment> OwnPublishedAsync(
        int teamId, int userId, int id, CancellationToken ct)
    {
        var entry = await _db.PlannedAssignments
            .FirstOrDefaultAsync(row => row.Id == id && row.TeamId == teamId, ct)
            ?? throw new NotFoundException("Assignment does not exist.");

        if (entry.UserId != userId)
            throw new ForbiddenException("That assignment is not yours to answer.");

        if (entry.Status != AssignmentStatus.Published)
            throw new ConflictException("That assignment is not open for an answer.");

        return entry;
    }

    /// <summary>The planner hears the answer; a hole needs replanning fast.</summary>
    private async Task AnswerAsync(PlannedAssignment entry, Team team, bool accepted, CancellationToken ct)
    {
        var who = (team.Members ?? [])
            .FirstOrDefault(member => member.UserId == entry.UserId)?.DisplayName ?? "?";
        var when = $"{entry.Date:dd.MM} · {entry.StartTime:HH\\:mm}–{entry.EndTime:HH\\:mm}";

        // Nobody to tell if the planner has since deleted their account. The
        // assignment itself stays; only the name attached to it is gone.
        if (entry.CreatedByUserId is not int planner) return;

        await _push.NotifyAsync(
            planner,
            language => (accepted, language) switch
            {
                (true, "ru") => ("Смена принята", $"{who}: «{entry.Title}» {when} — в календаре."),
                (true, "uk") => ("Зміну прийнято", $"{who}: «{entry.Title}» {when} — у календарі."),
                (true, _) => ("Assignment accepted", $"{who}: “{entry.Title}” {when} is on their calendar."),
                (false, "ru") => ("Отказ от смены", $"{who} не берёт «{entry.Title}» {when}. Нужна замена."),
                (false, "uk") => ("Відмова від зміни", $"{who} не бере «{entry.Title}» {when}. Потрібна заміна."),
                (false, _) => ("Assignment declined", $"{who} will not take “{entry.Title}” {when}. Replan it."),
            },
            "/schedule",
            ct);
    }

    // ==== Roles ====

    public async Task SetManagerAsync(int teamId, int callerId, int memberUserId, bool isManager, CancellationToken ct)
    {
        var (team, _) = await MemberAsync(teamId, callerId, ct);

        // Handing out the board is the owner's alone — a manager who could
        // mint managers effectively owns the team.
        if (team.OwnerUserId != callerId)
            throw new ForbiddenException("Only the owner hands out the board.");

        if (memberUserId == team.OwnerUserId)
            throw new ValidationException("The owner already plans.");

        var member = (team.Members ?? []).FirstOrDefault(entry => entry.UserId == memberUserId)
            ?? throw new NotFoundException("That person is not in the team.");

        member.IsManager = isManager;
        await _db.SaveChangesAsync(ct);
    }
}

/// <summary>The board's pure rules, kept out of the service for the tests.</summary>
public static class PlannerRules
{
    public const int TitleMax = 60;

    /// <summary>The station, or Unset where nobody said. Never guessed from a title.</summary>
    public static PlanRole ParseRole(string? value) => value?.Trim().ToLowerInvariant() switch
    {
        "bar" => PlanRole.Bar,
        "kitchen" => PlanRole.Kitchen,
        "floor" => PlanRole.Floor,
        "host" => PlanRole.Host,
        "support" => PlanRole.Support,
        "manager" => PlanRole.Manager,
        _ => PlanRole.Unset,
    };

    public static (DateOnly Date, TimeOnly Start, TimeOnly End) ParseSlot(
        string date, string start, string end)
    {
        if (!DateOnly.TryParseExact(date, "yyyy-MM-dd", out var day))
            throw new ValidationException("The date looks wrong.");

        if (!TimeOnly.TryParseExact(start, "HH:mm", out var from)
            || !TimeOnly.TryParseExact(end, "HH:mm", out var to))
            throw new ValidationException("Times must be HH:mm.");

        // Equal edges plan nothing; end before start is an overnight and fine.
        if (from == to)
            throw new ValidationException("The shift must last some time.");

        return (day, from, to);
    }

    /// <summary>
    /// An optional note beside a blocked day. Absent is the normal case —
    /// people mark a day and move on — so nothing here throws.
    /// </summary>
    /// <summary>As long as a day's note, which is the longest thing anyone writes here.</summary>
    public const int NoteMax = 500;

    public static string? CleanReason(string? reason)
    {
        var cleaned = reason?.Trim();

        if (string.IsNullOrEmpty(cleaned)) return null;

        return cleaned.Length <= TitleMax ? cleaned : cleaned[..TitleMax];
    }

    /// <summary>
    /// The note on an assignment. It was the one free-text field in the app
    /// with no bound at all — straight into a text column, and copied forward
    /// by "repeat the week". Every other note in the project is capped.
    /// </summary>
    public static string? CleanNote(string? note)
    {
        var cleaned = note?.Trim();

        if (string.IsNullOrEmpty(cleaned)) return null;

        return cleaned.Length <= NoteMax ? cleaned : cleaned[..NoteMax];
    }

    public static string CleanTitle(string title)
    {
        var cleaned = title.Trim();

        if (cleaned.Length is < 1 or > TitleMax)
            throw new ValidationException($"The title must be 1–{TitleMax} characters.");

        return cleaned;
    }
}
