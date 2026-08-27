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
                Reason = PlannerRules.CleanTitle(request.reason) is { Length: > 0 } reason ? reason : null,
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
            entry.Note = request.note;
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

        await _push.NotifyAsync(
            entry.CreatedByUserId,
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

    public static string CleanTitle(string title)
    {
        var cleaned = title.Trim();

        if (cleaned.Length is < 1 or > TitleMax)
            throw new ValidationException($"The title must be 1–{TitleMax} characters.");

        return cleaned;
    }
}
