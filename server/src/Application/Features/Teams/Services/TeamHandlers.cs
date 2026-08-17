using System.Security.Cryptography;
using MediatR;
using Shifter.Application.Common.Exceptions;
using Shifter.Application.Features.Teams.DTOs;
using Shifter.Domain.Entities;
using Shifter.Infrastructure.Repositories.Interfaces;

namespace Shifter.Application.Features.Teams.Services;

public static class TeamRules
{
    public const int NameMaxLength = 60;
    public const int MaxMembers = 60;

    /// <summary>
    /// Six characters from an alphabet with no 0/O or 1/I/L in it: the code
    /// gets read aloud across a bar, and those are the pairs people mishear.
    /// </summary>
    private const string CodeAlphabet = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

    public static string NewCode()
    {
        char[] code = new char[6];

        for (int index = 0; index < code.Length; index += 1)
            code[index] = CodeAlphabet[RandomNumberGenerator.GetInt32(CodeAlphabet.Length)];

        return new string(code);
    }

    public static string RequireName(string? value, string field)
    {
        if (string.IsNullOrWhiteSpace(value))
            throw new ValidationException($"{field} is empty.");

        if (value.Trim().Length > NameMaxLength)
            throw new ValidationException($"{field} must be at most {NameMaxLength} characters.");

        return value.Trim();
    }

    public static TeamDto ToDto(Team team, int userId)
    {
        bool owner = team.OwnerUserId == userId;

        return new TeamDto(
            team.Id,
            team.Name,
            owner,
            team.Members?.Count ?? 0,
            // Handing the code to every member would make removing someone
            // pointless: they could walk straight back in.
            owner ? team.InviteCode : null);
    }
}

public class ListTeamsHandler : IRequestHandler<ListTeamsDto, TeamDto[]>
{
    private readonly ITeamRepository _teams;

    public ListTeamsHandler(ITeamRepository teams) => _teams = teams;

    public async Task<TeamDto[]> Handle(ListTeamsDto request, CancellationToken ct)
    {
        Team[] teams = await _teams.GetForUserAsync(request.UserId, ct);

        return teams.Select(team => TeamRules.ToDto(team, request.UserId)).ToArray();
    }
}

public class CreateTeamHandler : IRequestHandler<CreateTeamDto, TeamDto>
{
    private readonly ITeamRepository _teams;
    private readonly IUserQuery _users;

    public CreateTeamHandler(ITeamRepository teams, IUserQuery users)
    {
        _teams = teams;
        _users = users;
    }

    public async Task<TeamDto> Handle(CreateTeamDto request, CancellationToken ct)
    {
        User user = await _users.GetByIdAsync(request.UserId, ct)
            ?? throw new UnauthorizedException("This account no longer exists.");

        string code = await UniqueCodeAsync(_teams, ct);

        Team team = new Team
        {
            Name = TeamRules.RequireName(request.name, "Team name"),
            OwnerUserId = request.UserId,
            InviteCode = code,
        };

        await _teams.AddAsync(team, ct);

        // The creator is a member as well as the owner; a rota with nobody on
        // it is not a useful starting point.
        await _teams.AddMemberAsync(
            new TeamMember
            {
                TeamId = team.Id,
                UserId = request.UserId,
                DisplayName = user.FirstName,
            },
            ct);

        // Re-read rather than append in memory: the context is tracking this
        // team, so adding the member already filled its collection, and adding
        // it a second time by hand counted everyone twice.
        Team saved = await _teams.GetForMemberAsync(team.Id, request.UserId, ct) ?? team;

        return TeamRules.ToDto(saved, request.UserId);
    }

    /// <summary>Retries on the rare collision rather than failing the request.</summary>
    internal static async Task<string> UniqueCodeAsync(ITeamRepository teams, CancellationToken ct)
    {
        for (int attempt = 0; attempt < 10; attempt += 1)
        {
            string candidate = TeamRules.NewCode();

            if (!await teams.CodeExistsAsync(candidate, ct)) return candidate;
        }

        throw new ConflictException("Could not allocate an invite code. Try again.");
    }
}

public class JoinTeamHandler : IRequestHandler<JoinTeamDto, TeamDto>
{
    private readonly ITeamRepository _teams;
    private readonly IUserQuery _users;

    public JoinTeamHandler(ITeamRepository teams, IUserQuery users)
    {
        _teams = teams;
        _users = users;
    }

    public async Task<TeamDto> Handle(JoinTeamDto request, CancellationToken ct)
    {
        string code = (request.invite_code ?? string.Empty).Trim().ToUpperInvariant();

        if (code.Length == 0) throw new ValidationException("Invite code is empty.");

        Team team = await _teams.GetByCodeAsync(code, ct)
            ?? throw new NotFoundException("No team with that code.");

        if (team.Members?.Any(member => member.UserId == request.UserId) == true)
            return TeamRules.ToDto(team, request.UserId);

        if ((team.Members?.Count ?? 0) >= TeamRules.MaxMembers)
            throw new ConflictException("This team is full.");

        User user = await _users.GetByIdAsync(request.UserId, ct)
            ?? throw new UnauthorizedException("This account no longer exists.");

        string name = string.IsNullOrWhiteSpace(request.display_name)
            ? user.FirstName
            : TeamRules.RequireName(request.display_name, "Display name");

        await _teams.AddMemberAsync(
            new TeamMember { TeamId = team.Id, UserId = request.UserId, DisplayName = name },
            ct);

        Team joined = await _teams.GetForMemberAsync(team.Id, request.UserId, ct) ?? team;

        return TeamRules.ToDto(joined, request.UserId);
    }
}

public class LeaveTeamHandler : IRequestHandler<LeaveTeamDto, Unit>
{
    private readonly ITeamRepository _teams;

    public LeaveTeamHandler(ITeamRepository teams) => _teams = teams;

    public async Task<Unit> Handle(LeaveTeamDto request, CancellationToken ct)
    {
        Team team = await _teams.GetForMemberAsync(request.TeamId, request.UserId, ct)
            ?? throw new NotFoundException("Team does not exist.");

        // The owner leaving takes the team with it: an ownerless rota nobody
        // can administer is worse than none.
        if (team.OwnerUserId == request.UserId)
        {
            await _teams.RemoveTeamAsync(team, ct);

            return Unit.Value;
        }

        TeamMember member = team.Members!.First(entry => entry.UserId == request.UserId);

        await _teams.RemoveMemberAsync(member, ct);

        return Unit.Value;
    }
}

public class RotateCodeHandler : IRequestHandler<RotateCodeDto, TeamDto>
{
    private readonly ITeamRepository _teams;

    public RotateCodeHandler(ITeamRepository teams) => _teams = teams;

    public async Task<TeamDto> Handle(RotateCodeDto request, CancellationToken ct)
    {
        Team team = await _teams.GetForMemberAsync(request.TeamId, request.UserId, ct)
            ?? throw new NotFoundException("Team does not exist.");

        if (team.OwnerUserId != request.UserId)
            throw new ForbiddenException("Only the owner can change the code.");

        team.InviteCode = await CreateTeamHandler.UniqueCodeAsync(_teams, ct);

        await _teams.SaveAsync(ct);

        return TeamRules.ToDto(team, request.UserId);
    }
}

public class GetRotaHandler : IRequestHandler<GetRotaDto, RotaDto>
{
    private const int MaxRangeDays = 120;

    private readonly ITeamRepository _teams;

    public GetRotaHandler(ITeamRepository teams) => _teams = teams;

    public async Task<RotaDto> Handle(GetRotaDto request, CancellationToken ct)
    {
        if (request.From > request.To)
            throw new ValidationException("Range start must not be after its end.");

        if (request.To.DayNumber - request.From.DayNumber > MaxRangeDays)
            throw new ValidationException($"At most {MaxRangeDays} days at a time.");

        // Membership is enforced by the lookup itself: a non-member gets null
        // here and never reaches the rota.
        Team team = await _teams.GetForMemberAsync(request.TeamId, request.UserId, ct)
            ?? throw new NotFoundException("Team does not exist.");

        TeamMember[] members = (team.Members ?? []).OrderBy(m => m.DisplayName).ToArray();

        RotaRow[] rows = await _teams.GetRotaAsync(
            members.Select(member => member.UserId).ToArray(),
            request.From,
            request.To,
            ct);

        Dictionary<int, TeamMember> byUser = members.ToDictionary(member => member.UserId);

        RotaEntryDto[] entries = rows
            .Where(row => byUser.ContainsKey(row.UserId))
            .Select(row =>
            {
                double hours = PaidHours(row);

                return new RotaEntryDto(
                    byUser[row.UserId].Id,
                    row.Date,
                    row.ShiftName,
                    row.Symbol,
                    row.Colour,
                    row.StartTime.ToString("HH:mm"),
                    row.EndTime.ToString("HH:mm"),
                    Math.Round(hours, 2),
                    row.Worked,
                    row.NeedsCover);
            })
            .OrderBy(entry => entry.date)
            .ThenBy(entry => entry.start_time)
            .ToArray();

        RotaMemberDto[] summary = members
            .Select(member =>
            {
                RotaEntryDto[] theirs = entries
                    .Where(entry => entry.member_id == member.Id)
                    .ToArray();

                return new RotaMemberDto(
                    member.Id,
                    member.DisplayName,
                    member.UserId == request.UserId,
                    Math.Round(theirs.Sum(entry => entry.hours), 2),
                    theirs.Select(entry => entry.date).Distinct().Count(),
                    theirs.Count(entry => entry.needs_cover));
            })
            .ToArray();

        return new RotaDto(team.Id, team.Name, summary, entries, Days(request, summary, entries));
    }

    /// <summary>
    /// Day by day across the whole team: how many are on, who is free, and how
    /// many shifts are looking for cover.
    ///
    /// "Who is free" is the question a rota is actually opened to answer —
    /// somebody dropped out, and the alternative is ringing round the group.
    /// It names only people, never anything about them.
    /// </summary>
    private static RotaDayDto[] Days(
        GetRotaDto request,
        RotaMemberDto[] members,
        RotaEntryDto[] entries)
    {
        List<RotaDayDto> days = [];

        for (DateOnly date = request.From; date <= request.To; date = date.AddDays(1))
        {
            RotaEntryDto[] onDate = entries.Where(entry => entry.date == date).ToArray();
            int[] working = onDate.Select(entry => entry.member_id).Distinct().ToArray();

            days.Add(new RotaDayDto(
                date,
                working.Length,
                members
                    .Where(member => !working.Contains(member.member_id))
                    .Select(member => member.display_name)
                    .ToArray(),
                Math.Round(onDate.Sum(entry => entry.hours), 2),
                onDate.Count(entry => entry.needs_cover)));
        }

        return [.. days];
    }

    /// <summary>
    /// The same arithmetic DayShift uses, applied to the projected row: clock
    /// time wrapping past midnight, less the unpaid break.
    /// </summary>
    private static double PaidHours(RotaRow row)
    {
        TimeSpan span = row.EndTime - row.StartTime;

        if (span < TimeSpan.Zero) span += TimeSpan.FromDays(1);

        TimeSpan paid = span - TimeSpan.FromMinutes(row.BreakMinutes);

        return paid < TimeSpan.Zero ? 0 : paid.TotalHours;
    }
}
